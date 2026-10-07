package com.marsledger.collector

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import org.json.JSONArray

class MainActivity : AppCompatActivity() {
    private val prefs by lazy { Prefs(this) }
    private val updater by lazy { AppUpdater(this) { message -> show(message) } }
    private var restoring = false
    private val logListener: (String) -> Unit = { text ->
        findViewById<TextView>(R.id.logView).text = text
        renderStatus()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        findViewById<EditText>(R.id.emailInput).setText(prefs.email)
        findViewById<EditText>(R.id.sampleInput).setText("[삼성카드] 10/05 14:22 승인 피자헛 35,000원 일시불")

        val enabled = findViewById<SwitchCompat>(R.id.enabledSwitch)
        enabled.isChecked = prefs.enabled
        enabled.setOnCheckedChangeListener { _, checked -> prefs.enabled = checked; renderStatus() }

        findViewById<Button>(R.id.loginButton).setOnClickListener { authenticate(signUp = false) }
        findViewById<Button>(R.id.signUpButton).setOnClickListener { authenticate(signUp = true) }
        findViewById<Button>(R.id.logoutButton).setOnClickListener {
            prefs.clearSession()
            findViewById<EditText>(R.id.emailInput).setText("")
            findViewById<EditText>(R.id.passwordInput).setText("")
            renderStatus()
        }
        findViewById<Button>(R.id.listenerButton).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        findViewById<Button>(R.id.batteryButton).setOnClickListener {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            intent.data = Uri.parse("package:$packageName")
            startActivity(intent)
        }
        findViewById<Button>(R.id.flushButton).setOnClickListener { Collector.flush(this) }
        if (prefs.loggedIn || (prefs.email.isNotBlank() && prefs.password.isNotBlank())) {
            findViewById<View>(R.id.emailInput).visibility = View.GONE
            findViewById<View>(R.id.passwordInput).visibility = View.GONE
            findViewById<View>(R.id.authRow).visibility = View.GONE
        }

        findViewById<Button>(R.id.sampleButton).setOnClickListener {
            val text = findViewById<EditText>(R.id.sampleInput).text.toString()
            if (parseNotification(text) == null) {
                findViewById<TextView>(R.id.logView).text = "금액과 승인/출금/입금이 있는 금융 알림이 아닙니다.\n${prefs.logText}"
                return@setOnClickListener
            }
            Collector.testSend(this, text)
        }
    }

    override fun onResume() {
        super.onResume()
        Collector.listen(logListener)
        findViewById<TextView>(R.id.logView).text = prefs.logText
        renderStatus()
        updater.installPendingIfAllowed()
        if (!restoring && !prefs.loggedIn && prefs.email.isNotBlank() && prefs.password.isNotBlank()) {
            restoreLogin()
        } else if (prefs.loggedIn && System.currentTimeMillis() >= prefs.expiresAt) {
            restoreLogin()
        }
        updater.check()
    }

    override fun onPause() {
        Collector.unlisten(logListener)
        super.onPause()
    }

    private fun authenticate(signUp: Boolean) {
        val email = findViewById<EditText>(R.id.emailInput).text.toString().trim()
        val password = findViewById<EditText>(R.id.passwordInput).text.toString()
        if (!connectionReady()) return
        if (!email.contains("@") || password.length < 6) {
            show("이메일과 6자 이상 비밀번호가 필요합니다.")
            return
        }
        Thread {
            try {
                val api = SupabaseApi(prefs)
                if (signUp) {
                    val session = api.signUp(email, password)
                    runOnUiThread {
                        show(if (session) "가입하고 로그인했습니다." else "가입했습니다. 이메일 인증 후 로그인해 주세요.")
                        renderStatus()
                    }
                } else {
                    api.signIn(email, password)
                    runOnUiThread {
                        findViewById<EditText>(R.id.passwordInput).setText("")
                        show("로그인했습니다. 다음부터는 다시 입력하지 않아도 됩니다.")
                        renderStatus()
                    }
                }
                if (prefs.loggedIn) Collector.flush(this)
            } catch (error: Exception) {
                runOnUiThread { show(error.message ?: "로그인에 실패했습니다.") }
            }
        }.start()
    }

    private fun restoreLogin() {
        if (restoring) return
        if (!connectionReady()) return
        restoring = true
        renderStatus()
        Thread {
            try {
                SupabaseApi(prefs).ensureSession()
                runOnUiThread {
                    restoring = false
                    findViewById<EditText>(R.id.passwordInput).setText("")
                    renderStatus()
                    if (prefs.loggedIn) Collector.flush(this)
                }
            } catch (error: Exception) {
                val message = error.message ?: "로그인에 실패했습니다."
                if (message.contains("올바르지 않습니다")) prefs.password = ""
                runOnUiThread {
                    restoring = false
                    show(message)
                    renderStatus()
                }
            }
        }.start()
    }

    private fun connectionReady(): Boolean {
        if (prefs.url.startsWith("https://") && prefs.anonKey.length >= 20) return true
        show("연결 정보가 빌드에 없습니다. web/.env.local을 확인한 뒤 앱을 다시 빌드해 주세요.")
        return false
    }

    private fun renderStatus() {
        val queue = runCatching { JSONArray(prefs.queueJson).length() }.getOrDefault(0)
        val login = when {
            prefs.loggedIn -> "로그인됨 ${prefs.email}"
            restoring -> "로그인 확인 중"
            else -> "로그인 안 됨"
        }
        val access = if (listenerEnabled()) "알림 접근 허용" else "알림 접근 꺼짐"
        val collect = if (prefs.enabled) "수집 켜짐" else "수집 꺼짐"
        findViewById<TextView>(R.id.statusView).text =
            "$login\n$access\n$collect\n대기 $queue 건\n버전 ${BuildConfig.VERSION_NAME}"

        val showLogin = !prefs.loggedIn && !restoring
        val loginVisibility = if (showLogin) View.VISIBLE else View.GONE
        findViewById<View>(R.id.emailInput).visibility = loginVisibility
        findViewById<View>(R.id.passwordInput).visibility = loginVisibility
        findViewById<View>(R.id.authRow).visibility = loginVisibility
        findViewById<View>(R.id.logoutButton).visibility = if (prefs.loggedIn) View.VISIBLE else View.GONE
    }

    private fun listenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.contains(packageName)
    }

    private fun show(message: String) {
        findViewById<TextView>(R.id.logView).text = "$message\n${prefs.logText}"
    }
}
