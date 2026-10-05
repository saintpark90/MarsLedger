package com.marsledger.collector

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors

object Collector {
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val listeners = linkedSetOf<(String) -> Unit>()
    private var categories = JSONArray()
    private var rules = JSONArray()
    private var rulesLoadedAt = 0L

    fun listen(listener: (String) -> Unit) {
        listeners += listener
    }

    fun unlisten(listener: (String) -> Unit) {
        listeners -= listener
    }

    fun submit(context: Context, text: String, postedAt: Long, key: String, packageName: String) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                ingest(appContext, text, postedAt, key, packageName)
            } catch (error: Exception) {
                log(appContext, "오류: ${error.message ?: "알 수 없는 오류"}")
            }
        }
    }

    fun flush(context: Context) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                sendQueue(appContext)
            } catch (error: Exception) {
                log(appContext, "다시 보내기 실패: ${error.message}")
            }
        }
    }

    fun testSend(context: Context, text: String) {
        submit(context, text, System.currentTimeMillis(), "manual-${UUID.randomUUID()}", context.packageName)
    }

    private fun ingest(context: Context, text: String, postedAt: Long, key: String, packageName: String) {
        val prefs = Prefs(context)
        if (!prefs.enabled) return
        val parsed = parseNotification(text) ?: return
        if (!prefs.loggedIn) {
            enqueue(prefs, text, postedAt, key, packageName)
            log(context, "로그인 대기 · ${parsed.merchant} ${parsed.amount}원")
            return
        }
        val sent = sendOne(context, prefs, parsed, text, postedAt, key, packageName)
        if (sent) {
            log(context, "전송 · ${parsed.merchant} ${parsed.amount}원")
            sendQueue(context)
        } else {
            enqueue(prefs, text, postedAt, key, packageName)
        }
    }

    private fun sendQueue(context: Context) {
        val prefs = Prefs(context)
        if (!prefs.loggedIn) return
        val queue = JSONArray(prefs.queueJson)
        if (queue.length() == 0) return
        val remain = JSONArray()
        for (index in 0 until queue.length()) {
            val item = queue.getJSONObject(index)
            val parsed = parseNotification(item.getString("text")) ?: continue
            val sent = sendOne(
                context,
                prefs,
                parsed,
                item.getString("text"),
                item.getLong("postedAt"),
                item.getString("key"),
                item.optString("packageName"),
            )
            if (!sent) remain.put(item)
        }
        prefs.queueJson = remain.toString()
        if (remain.length() == 0) log(context, "대기 항목을 모두 보냈습니다.")
    }

    private fun sendOne(
        context: Context,
        prefs: Prefs,
        parsed: ParsedNotification,
        rawText: String,
        postedAt: Long,
        key: String,
        packageName: String,
    ): Boolean {
        return try {
            ensureRules(context, prefs)
            val categoryId = resolveCategory(parsed.merchant, parsed.direction)
            val row = JSONObject()
                .put("id", UUID.randomUUID().toString())
                .put("user_id", prefs.userId)
                .put("amount", parsed.amount)
                .put("merchant", parsed.merchant)
                .put("raw_text", rawText)
                .put("direction", parsed.direction)
                .put("method", parsed.method)
                .put("instrument", parsed.instrument ?: JSONObject.NULL)
                .put("category_id", categoryId ?: JSONObject.NULL)
                .put("source", "notification")
                .put("notification_key", key)
                .put("package_name", packageName)
                .put("balance_after", parsed.balanceAfter ?: JSONObject.NULL)
                .put("occurred_at", Instant.ofEpochMilli(postedAt).toString())
                .put("auto_categorized", true)
            SupabaseApi(prefs).insertTransaction(row)
            true
        } catch (error: Exception) {
            log(context, "전송 실패 · ${error.message}")
            false
        }
    }

    private fun ensureRules(context: Context, prefs: Prefs) {
        if (rulesLoadedAt > System.currentTimeMillis() - 10 * 60 * 1000 && categories.length() > 0) return
        val loaded = SupabaseApi(prefs).loadRules(context)
        categories = loaded.first
        rules = loaded.second
        rulesLoadedAt = System.currentTimeMillis()
    }

    private fun resolveCategory(merchant: String, direction: String): String? {
        val haystack = merchant.lowercase().replace(Regex("\\s+"), "")
        var matchedId: String? = null
        var matchedLength = -1
        for (index in 0 until rules.length()) {
            val rule = rules.getJSONObject(index)
            val keyword = rule.getString("keyword")
            val needle = keyword.lowercase().replace(Regex("\\s+"), "")
            if (needle.isNotEmpty() && haystack.contains(needle) && needle.length > matchedLength) {
                matchedLength = needle.length
                matchedId = rule.getString("category_id")
            }
        }
        val matched = (0 until categories.length()).map { categories.getJSONObject(it) }.firstOrNull { it.getString("id") == matchedId }
        fun find(name: String, kind: String): String? {
            return (0 until categories.length())
                .map { categories.getJSONObject(it) }
                .firstOrNull { it.getString("name") == name && it.getString("kind") == kind }
                ?.getString("id")
        }
        if (direction == "income") {
            if (matched?.optString("kind") == "income") return matched.getString("id")
            return find("급여", "income")
        }
        if (matched?.optString("kind") == "expense") return matched.getString("id")
        return find("기타", "expense")
    }

    private fun enqueue(prefs: Prefs, text: String, postedAt: Long, key: String, packageName: String) {
        val queue = JSONArray(prefs.queueJson)
        for (index in 0 until queue.length()) {
            if (queue.getJSONObject(index).optString("key") == key) return
        }
        queue.put(JSONObject().put("text", text).put("postedAt", postedAt).put("key", key).put("packageName", packageName))
        while (queue.length() > 200) queue.remove(0)
        prefs.queueJson = queue.toString()
    }

    private fun log(context: Context, line: String) {
        val prefs = Prefs(context)
        val stamp = android.text.format.DateFormat.format("MM-dd HH:mm", System.currentTimeMillis())
        val next = "$stamp $line\n${prefs.logText}".lineSequence().take(40).joinToString("\n")
        prefs.logText = next
        main.post { listeners.forEach { it(next) } }
    }
}
