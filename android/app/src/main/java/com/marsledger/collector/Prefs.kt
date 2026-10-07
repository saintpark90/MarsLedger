package com.marsledger.collector

import android.content.Context

class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("marsledger", Context.MODE_PRIVATE)

    val url: String
        get() = BuildConfig.SUPABASE_URL.trim().trimEnd('/')

    val anonKey: String
        get() = BuildConfig.SUPABASE_ANON_KEY.trim()

    var email: String
        get() = prefs.getString("email", "") ?: ""
        set(value) = prefs.edit().putString("email", value.trim()).apply()

    var password: String
        get() = prefs.getString("password", "") ?: ""
        set(value) = prefs.edit().putString("password", value).apply()

    var accessToken: String
        get() = prefs.getString("access", "") ?: ""
        set(value) = prefs.edit().putString("access", value).apply()

    var refreshToken: String
        get() = prefs.getString("refresh", "") ?: ""
        set(value) = prefs.edit().putString("refresh", value).apply()

    var expiresAt: Long
        get() = prefs.getLong("expires", 0L)
        set(value) = prefs.edit().putLong("expires", value).apply()

    var userId: String
        get() = prefs.getString("user", "") ?: ""
        set(value) = prefs.edit().putString("user", value).apply()

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", true)
        set(value) = prefs.edit().putBoolean("enabled", value).apply()

    var queueJson: String
        get() = prefs.getString("queue", "[]") ?: "[]"
        set(value) = prefs.edit().putString("queue", value).apply()

    var logText: String
        get() = prefs.getString("log", "") ?: ""
        set(value) = prefs.edit().putString("log", value).apply()

    val loggedIn: Boolean
        get() = accessToken.isNotBlank() && userId.isNotBlank()

    fun clearSession() {
        prefs.edit()
            .remove("access")
            .remove("refresh")
            .remove("expires")
            .remove("user")
            .remove("email")
            .remove("password")
            .apply()
    }
}
