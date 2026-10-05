package com.marsledger.collector

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

class SupabaseApi(private val prefs: Prefs) {
    private val http = OkHttpClient.Builder().callTimeout(25, TimeUnit.SECONDS).build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun signIn(email: String, password: String) {
        val body = JSONObject().put("email", email).put("password", password)
        val (code, payload) = auth("/auth/v1/token?grant_type=password", body)
        if (!payload.has("access_token")) {
            throw IllegalStateException(authMessage(payload, code))
        }
        saveSession(payload, email)
    }

    fun signUp(email: String, password: String): Boolean {
        val body = JSONObject().put("email", email).put("password", password)
        val (code, payload) = auth("/auth/v1/signup", body)
        if (payload.has("access_token")) {
            saveSession(payload, email)
            return true
        }
        if (code in 200..299) return false
        throw IllegalStateException(authMessage(payload, code))
    }

    fun insertTransaction(row: JSONObject) {
        val code = post("transactions", row, ignoreDuplicates = true)
        if (code == 409 || code in 200..299) return
        throw IllegalStateException("전송 실패 ($code)")
    }

    fun loadRules(context: android.content.Context): Pair<JSONArray, JSONArray> {
        val categories = get("categories?select=id,name,kind&limit=100")
        if (categories.length() == 0) seed(context)
        val readyCategories = if (categories.length() == 0) get("categories?select=id,name,kind&limit=100") else categories
        val rules = get("category_rules?select=keyword,category_id&limit=1000")
        return readyCategories to rules
    }

    private fun seed(context: android.content.Context) {
        val catalog = JSONArray(context.assets.open("categories.json").bufferedReader(Charsets.UTF_8).use { it.readText() })
        val categories = JSONArray()
        val rules = JSONArray()
        for (index in 0 until catalog.length()) {
            val item = catalog.getJSONObject(index)
            val id = UUID.randomUUID().toString()
            categories.put(
                JSONObject()
                    .put("id", id)
                    .put("user_id", prefs.userId)
                    .put("name", item.getString("name"))
                    .put("kind", item.getString("kind"))
                    .put("color", item.getString("color"))
                    .put("sort_order", item.getInt("sort")),
            )
            val keywords = item.getJSONArray("keywords")
            for (keywordIndex in 0 until keywords.length()) {
                rules.put(
                    JSONObject()
                        .put("id", UUID.randomUUID().toString())
                        .put("user_id", prefs.userId)
                        .put("category_id", id)
                        .put("keyword", keywords.getString(keywordIndex)),
                )
            }
        }
        post("categories", categories, ignoreDuplicates = true)
        post("category_rules", rules, ignoreDuplicates = true)
        post("user_settings", JSONObject().put("user_id", prefs.userId), ignoreDuplicates = true)
    }

    private fun saveSession(payload: JSONObject, email: String) {
        prefs.accessToken = payload.getString("access_token")
        prefs.refreshToken = payload.optString("refresh_token", prefs.refreshToken)
        prefs.expiresAt = System.currentTimeMillis() + payload.optLong("expires_in", 3600) * 1000L - 60_000L
        prefs.userId = payload.getJSONObject("user").getString("id")
        prefs.email = email
    }

    private fun auth(path: String, body: JSONObject): Pair<Int, JSONObject> {
        val request = Request.Builder()
            .url(endpoint(path))
            .header("apikey", prefs.anonKey)
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val payload = if (text.isBlank()) JSONObject() else JSONObject(text)
            return response.code to payload
        }
    }

    private fun authMessage(payload: JSONObject, code: Int): String {
        val message = payload.optString("msg", payload.optString("error_description", payload.optString("message", "")))
        if (message.contains("already", true)) return "이미 가입된 이메일입니다."
        if (message.contains("Invalid login", true)) return "이메일 또는 비밀번호가 올바르지 않습니다."
        return message.ifBlank { "인증 실패 ($code)" }
    }

    private fun ensureAuth() {
        if (prefs.accessToken.isBlank()) throw IllegalStateException("로그인이 필요합니다.")
        if (System.currentTimeMillis() < prefs.expiresAt) return
        if (prefs.refreshToken.isBlank()) throw IllegalStateException("다시 로그인해 주세요.")
        val (_, payload) = auth("/auth/v1/token?grant_type=refresh_token", JSONObject().put("refresh_token", prefs.refreshToken))
        if (!payload.has("access_token")) throw IllegalStateException("다시 로그인해 주세요.")
        saveSession(payload, prefs.email)
    }

    private fun get(query: String): JSONArray {
        ensureAuth()
        val request = Request.Builder()
            .url(endpoint("/rest/v1/$query"))
            .header("apikey", prefs.anonKey)
            .header("Authorization", "Bearer ${prefs.accessToken}")
            .get()
            .build()
        return execute(request)
    }

    private fun post(table: String, body: Any, ignoreDuplicates: Boolean, allowRefresh: Boolean = true): Int {
        ensureAuth()
        val prefer = if (ignoreDuplicates) "resolution=ignore-duplicates,return=minimal" else "return=minimal"
        val request = Request.Builder()
            .url(endpoint("/rest/v1/$table"))
            .header("apikey", prefs.anonKey)
            .header("Authorization", "Bearer ${prefs.accessToken}")
            .header("Content-Type", "application/json")
            .header("Prefer", prefer)
            .post(body.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            if (response.code == 401 && allowRefresh) {
                prefs.expiresAt = 0
                ensureAuth()
                return post(table, body, ignoreDuplicates, allowRefresh = false)
            }
            if (response.code == 409 || response.isSuccessful) return response.code
            val text = response.body?.string().orEmpty()
            throw IllegalStateException(text.ifBlank { "전송 실패 (${response.code})" }.take(180))
        }
    }

    private fun execute(request: Request, allowRefresh: Boolean = true): JSONArray {
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 && allowRefresh) {
                prefs.expiresAt = 0
                ensureAuth()
                val retry = request.newBuilder().header("Authorization", "Bearer ${prefs.accessToken}").build()
                return execute(retry, allowRefresh = false)
            }
            if (!response.isSuccessful) throw IllegalStateException(text.ifBlank { "조회 실패 (${response.code})" }.take(180))
            return if (text.isBlank()) JSONArray() else JSONArray(text)
        }
    }

    private fun endpoint(path: String): String {
        val base = prefs.url.trim().trimEnd('/')
        if (!base.startsWith("https://")) throw IllegalStateException("Supabase 주소는 https여야 합니다.")
        return base + path
    }
}
