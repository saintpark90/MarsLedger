package com.marsledger.collector

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class AppUpdater(
    private val activity: AppCompatActivity,
    private val onStatus: (String) -> Unit,
) {
    private val http = OkHttpClient.Builder()
        .callTimeout(3, TimeUnit.MINUTES)
        .readTimeout(3, TimeUnit.MINUTES)
        .build()
    private val checking = AtomicBoolean(false)
    private var pending: File? = null
    private var lastCheckAt = 0L

    fun check() {
        val now = System.currentTimeMillis()
        if (now - lastCheckAt < 60_000) return
        if (!checking.compareAndSet(false, true)) return
        lastCheckAt = now
        Thread {
            try {
                val latest = fetchLatest()
                if (latest == null || latest.versionCode <= BuildConfig.VERSION_CODE) return@Thread
                activity.runOnUiThread { onStatus("새 버전 ${latest.versionName}을 받는 중…") }
                val file = download(latest.url)
                activity.runOnUiThread { promptInstall(file) }
            } catch (_: Exception) {
                lastCheckAt = 0L
            } finally {
                checking.set(false)
            }
        }.start()
    }

    fun installPendingIfAllowed() {
        val file = pending ?: return
        if (!file.exists()) {
            pending = null
            return
        }
        if (needsInstallPermission()) return
        pending = null
        install(file)
    }

    private fun fetchLatest(): RemoteRelease? {
        val request = Request.Builder()
            .url("https://api.github.com/repos/${BuildConfig.UPDATE_REPO}/releases?per_page=20")
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "MarsLedger-collector")
            .get()
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return null
            val text = response.body?.string().orEmpty()
            val root = JSONTokener(text).nextValue()
            if (root !is JSONArray) return null
            var best: RemoteRelease? = null
            for (index in 0 until root.length()) {
                val release = root.optJSONObject(index) ?: continue
                val versionCode = release.optString("tag_name").removePrefix("collector-v").toIntOrNull() ?: continue
                val url = apkUrl(release) ?: continue
                val name = release.optString("name").ifBlank { versionCode.toString() }
                if (best == null || versionCode > best.versionCode) {
                    best = RemoteRelease(versionCode, name, url)
                }
            }
            return best
        }
    }

    private fun apkUrl(release: JSONObject): String? {
        val assets = release.optJSONArray("assets") ?: return null
        for (index in 0 until assets.length()) {
            val asset = assets.optJSONObject(index) ?: continue
            if (asset.optString("name") == "MarsLedger-collector.apk") {
                return asset.optString("browser_download_url").ifBlank { null }
            }
        }
        return null
    }

    private fun download(url: String): File {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "MarsLedger-collector")
            .header("Accept", "application/vnd.android.package-archive")
            .get()
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("업데이트 다운로드 실패 (${response.code})")
            val body = response.body ?: throw IllegalStateException("업데이트 파일이 비어 있습니다.")
            val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
            val file = File(dir, "MarsLedger-collector.apk")
            val partial = File(dir, "MarsLedger-collector.apk.part")
            body.byteStream().use { input ->
                partial.outputStream().use { output -> input.copyTo(output) }
            }
            if (partial.length() < 100_000) throw IllegalStateException("업데이트 파일이 완전하지 않습니다.")
            if (file.exists()) file.delete()
            if (!partial.renameTo(file)) throw IllegalStateException("업데이트 파일을 저장하지 못했습니다.")
            return file
        }
    }

    private fun promptInstall(file: File) {
        pending = file
        if (needsInstallPermission()) {
            onStatus("업데이트를 설치하려면 이 앱의 설치를 허용해 주세요.")
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}"),
            )
            activity.startActivity(intent)
            return
        }
        pending = null
        install(file)
    }

    private fun install(file: File) {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val matches = activity.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        for (match in matches) {
            activity.grantUriPermission(
                match.activityInfo.packageName,
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
        activity.startActivity(intent)
        onStatus("새 버전 설치 화면을 열었습니다. 설치를 누르면 앱이 업데이트됩니다.")
    }

    private fun needsInstallPermission(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()
    }

    private data class RemoteRelease(val versionCode: Int, val versionName: String, val url: String)
}
