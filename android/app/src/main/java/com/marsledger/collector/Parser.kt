package com.marsledger.collector

data class ParsedNotification(
    val amount: Long,
    val merchant: String,
    val direction: String,
    val method: String,
    val instrument: String?,
    val balanceAfter: Long?,
    val accountLast4: String?,
)

private data class Instrument(val name: String, val method: String)

private val instruments = listOf(
    Instrument("삼성카드", "credit"),
    Instrument("현대카드", "credit"),
    Instrument("신한카드", "credit"),
    Instrument("KB국민카드", "credit"),
    Instrument("국민카드", "credit"),
    Instrument("롯데카드", "credit"),
    Instrument("우리카드", "credit"),
    Instrument("하나카드", "credit"),
    Instrument("NH농협카드", "credit"),
    Instrument("농협카드", "credit"),
    Instrument("BC카드", "credit"),
    Instrument("카카오뱅크", "transfer"),
    Instrument("토스뱅크", "transfer"),
    Instrument("케이뱅크", "transfer"),
    Instrument("IBK기업은행", "transfer"),
    Instrument("기업은행", "transfer"),
    Instrument("신한은행", "transfer"),
    Instrument("국민은행", "transfer"),
    Instrument("우리은행", "transfer"),
    Instrument("하나은행", "transfer"),
    Instrument("농협은행", "transfer"),
    Instrument("NH농협", "transfer"),
    Instrument("카카오페이", "unknown"),
    Instrument("네이버페이", "unknown"),
    Instrument("토스", "unknown"),
)

private val noiseWords = (
    listOf(
        "승인취소", "체크카드", "신용카드", "일시불", "할부개월", "할부", "체크", "신용",
        "승인", "출금", "입금", "결제", "이체", "송금", "취소", "환불", "잔액", "고객님",
        "님이", "님", "사용", "완료", "알림", "안내",
    ) + instruments.map { it.name }
    ).distinct().sortedByDescending { it.length }

fun accountLast4Of(raw: String): String? {
    val text = raw.replace(Regex("\\s+"), " ")
    val patterns = listOf(
        Regex("(?:입출금통장|모임통장|저금통|세이프박스|자유적금)\\s*[\\(\\[ ]?\\s*(?:\\*+)?(\\d{4})\\s*[\\)\\]]?"),
        Regex("(?:입|출)?\\s*통장\\s*[\\(\\[ ]?\\s*(?:\\*+)?(\\d{4})\\s*[\\)\\]]?"),
        Regex("계좌\\s*(?:번호)?\\s*[\\(\\[ ]?\\s*(?:\\*+)?(\\d{4})\\s*[\\)\\]]?"),
    )
    for (pattern in patterns) {
        val found = pattern.find(text)?.groupValues?.getOrNull(1)
        if (found != null) return found
    }
    return null
}

fun parseNotification(raw: String): ParsedNotification? {
    val text = raw.replace(Regex("\\s+"), " ").trim()
    if (text.isEmpty()) return null
    if (!Regex("[0-9][0-9,]*\\s*원").containsMatchIn(text)) return null
    if (!Regex("승인|출금|입금|결제|이체|송금|취소|입\\s*통장|출\\s*통장").containsMatchIn(text)) return null
    val accountLast4 = accountLast4Of(text)

    val balanceMatch = Regex("잔액\\s*[:：]?\\s*([0-9][0-9,]*)\\s*원").find(text)
    val balanceAfter = balanceMatch?.groupValues?.get(1)?.replace(",", "")?.toLongOrNull()
    var working = if (balanceMatch != null) text.replace(balanceMatch.value, " ") else text

    val isRefund = Regex("승인취소|결제취소|취소|환불").containsMatchIn(working)
    val deposit = Regex("입\\s*통장|입금|송금받").containsMatchIn(working)
    val withdraw = Regex("출\\s*통장|출금").containsMatchIn(working)
    val isIncome = !isRefund && (deposit && !withdraw || !deposit && !withdraw && Regex("급여|월급").containsMatchIn(working))

    var method = "unknown"
    var instrument: String? = null
    for (item in instruments.sortedByDescending { it.name.length }) {
        if (working.contains(item.name)) {
            instrument = item.name
            method = item.method
            break
        }
    }
    method = when {
        working.contains("체크") -> "debit"
        working.contains("신용") -> "credit"
        Regex("입\\s*통장|출\\s*통장").containsMatchIn(working) && method == "unknown" -> "transfer"
        Regex("출금|이체|송금").containsMatchIn(working) && method == "unknown" -> "transfer"
        working.contains("승인") && method == "unknown" -> "credit"
        else -> method
    }

    val amountMatch = Regex("([0-9][0-9,]*)\\s*원").find(working) ?: return null
    val amount = amountMatch.groupValues[1].replace(",", "").toLongOrNull() ?: return null
    if (amount <= 0) return null

    var merchant = working.replace(amountMatch.value, " ")
    merchant = merchant.replace(Regex("(?:입출금통장|모임통장|저금통|세이프박스|자유적금|(?:입|출)\\s*통장)\\s*[\\(\\[ ]?\\s*(?:\\*+)?\\d{4}\\s*[\\)\\]]?"), " ")
    merchant = merchant.replace(Regex("\\d{1,2}월\\s*\\d{1,2}일"), " ")
    merchant = merchant.replace(Regex("\\d{4}[./-]\\d{1,2}[./-]\\d{1,2}"), " ")
    merchant = merchant.replace(Regex("\\d{1,2}[./]\\d{1,2}"), " ")
    merchant = merchant.replace(Regex("\\d{1,2}:\\d{2}(?::\\d{2})?"), " ")
    merchant = merchant.replace(Regex("\\d+\\s*개월"), " ")
    merchant = merchant.replace(Regex("[가-힣]{1,4}\\*[가-힣]{1,4}님?"), " ")
    merchant = merchant.replace(Regex("[가-힣]{2,5}님"), " ")
    for (word in noiseWords) merchant = merchant.replace(word, " ")
    merchant = merchant.replace(Regex("[()\\[\\]{}<>★*·|,/:._+＋→-]"), " ")
    merchant = merchant.replace(Regex("\\s+"), " ").trim()

    val direction = when {
        isRefund -> "refund"
        isIncome -> "income"
        else -> "expense"
    }
    return ParsedNotification(
        amount = amount,
        merchant = merchant.ifBlank { "알 수 없는 사용처" },
        direction = direction,
        method = method,
        instrument = instrument,
        balanceAfter = balanceAfter,
        accountLast4 = accountLast4,
    )
}
