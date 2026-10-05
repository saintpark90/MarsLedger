package com.marsledger.collector

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class CollectorService : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        val now = System.currentTimeMillis()
        activeNotifications?.forEach { notification ->
            if (now - notification.postTime <= 10 * 60 * 1000L) deliver(notification)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        deliver(sbn)
    }

    private fun deliver(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val text = extract(sbn)
        if (text.isBlank()) return
        Collector.submit(this, text, sbn.postTime, sbn.key, sbn.packageName)
    }

    private fun extract(sbn: StatusBarNotification): String {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString(" ") { it.toString() }.orEmpty()
        return listOf(title, text, big, lines).filter { it.isNotBlank() }.distinct().joinToString("\n")
    }
}
