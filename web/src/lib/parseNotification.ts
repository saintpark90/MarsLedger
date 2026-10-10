import type { Direction, PayMethod } from "./types";

export type ParsedNotification = {
  amount: number;
  merchant: string;
  direction: Direction;
  method: PayMethod;
  instrument: string | null;
  balanceAfter: number | null;
  accountLast4: string | null;
  rawText: string;
};

const INSTRUMENTS: { name: string; method: PayMethod }[] = [
  { name: "삼성카드", method: "credit" },
  { name: "현대카드", method: "credit" },
  { name: "신한카드", method: "credit" },
  { name: "KB국민카드", method: "credit" },
  { name: "국민카드", method: "credit" },
  { name: "롯데카드", method: "credit" },
  { name: "우리카드", method: "credit" },
  { name: "하나카드", method: "credit" },
  { name: "NH농협카드", method: "credit" },
  { name: "농협카드", method: "credit" },
  { name: "BC카드", method: "credit" },
  { name: "카카오뱅크", method: "transfer" },
  { name: "토스뱅크", method: "transfer" },
  { name: "케이뱅크", method: "transfer" },
  { name: "IBK기업은행", method: "transfer" },
  { name: "기업은행", method: "transfer" },
  { name: "신한은행", method: "transfer" },
  { name: "국민은행", method: "transfer" },
  { name: "우리은행", method: "transfer" },
  { name: "하나은행", method: "transfer" },
  { name: "농협은행", method: "transfer" },
  { name: "NH농협", method: "transfer" },
  { name: "카카오페이", method: "unknown" },
  { name: "네이버페이", method: "unknown" },
  { name: "토스", method: "unknown" },
];

const NOISE = [
  "승인취소",
  "체크카드",
  "신용카드",
  "일시불",
  "할부개월",
  "할부",
  "체크",
  "신용",
  "승인",
  "출금",
  "입금",
  "결제",
  "이체",
  "송금",
  "취소",
  "환불",
  "잔액",
  "고객님",
  "님이",
  "님",
  "사용",
  "완료",
  "알림",
  "안내",
  ...INSTRUMENTS.map((item) => item.name),
];

const ACCOUNT_TOKENS = new Set([
  "모임통장",
  "입출금통장",
  "자유입출금",
  "저금통",
  "통장",
  "입금",
  "출금",
  "이체",
  "송금",
  "승인",
  "취소",
  "체크",
  "신용",
  "체크카드",
  "신용카드",
  ...INSTRUMENTS.map((item) => item.name),
]);

export function shortMerchant(raw: string): string {
  const text = raw
    .replace(/\s+/g, " ")
    .replace(/[()[\]{}<>]/g, " ")
    .replace(/누적\s*[\d,]+(?:\s*원)?/g, " ")
    .replace(/[\d,]+\s*원/g, " ")
    .replace(/(^|\s)원(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = collapseAdjacent(
    text.split(" ").filter((token) => token && token !== "원" && !/^[\d,]+$/.test(token)),
  );
  const unwrapped = unwrapRepeatedPrefix(tokens);
  const place = unwrapped.filter((token) => !ACCOUNT_TOKENS.has(token));
  if (place.length > 0) return preferSpecificStore(place).join(" ");
  return unwrapped[0] ?? "";
}

function preferSpecificStore(place: string[]): string[] {
  const last = place[place.length - 1];
  if (place.length >= 2 && last.length >= 12) return [last];
  return place;
}

export function merchantLabel(merchant: string, accountName?: string | null): string {
  const place = shortMerchant(merchant);
  if (place && !ACCOUNT_TOKENS.has(place)) return place;
  return accountName?.trim() || place || "이체";
}

function collapseAdjacent(tokens: string[]): string[] {
  const result: string[] = [];
  for (const token of tokens) {
    if (result[result.length - 1] !== token) result.push(token);
  }
  return result;
}

function unwrapRepeatedPrefix(tokens: string[]): string[] {
  for (let size = Math.floor(tokens.length / 2); size >= 2; size -= 1) {
    const head = tokens.slice(0, size).join(" ");
    if (tokens.slice(size, size * 2).join(" ") !== head) continue;
    let rest = tokens.slice(size);
    while (rest.length >= size && rest.slice(0, size).join(" ") === head) rest = rest.slice(size);
    if (rest.length > 0) return rest;
  }
  return tokens;
}

export function last4FromText(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ");
  const patterns = [
    /(?:입출금통장|모임통장|저금통|세이프박스|자유적금)\s*[([ ]?\s*(?:\*+)?(\d{4})\s*[)\]]?/,
    /(?:입|출)?\s*통장\s*[([ ]?\s*(?:\*+)?(\d{4})\s*[)\]]?/,
    /계좌\s*(?:번호)?\s*[([ ]?\s*(?:\*+)?(\d{4})\s*[)\]]?/,
  ];
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) return found[1];
  }
  return null;
}

export function parseNotification(raw: string): ParsedNotification | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const hasWon = /[0-9][0-9,]*\s*원/.test(text);
  const hasAction = /(승인|출금|입금|결제|이체|송금|취소|입\s*통장|출\s*통장)/.test(text);
  if (!hasWon || !hasAction) return null;
  const accountLast4 = last4FromText(text);

  const balanceMatch = text.match(/잔액\s*[:：]?\s*([0-9][0-9,]*)\s*원/);
  const balanceAfter = balanceMatch ? Number(balanceMatch[1].replace(/,/g, "")) : null;

  let working = text;
  if (balanceMatch) working = working.replace(balanceMatch[0], " ");

  const isRefund = /(승인취소|결제취소|취소|환불)/.test(working);
  const deposit = /(입\s*통장|입금|송금받)/.test(working);
  const withdraw = /(출\s*통장|출금)/.test(working);
  const isIncome = !isRefund && (deposit && !withdraw || (!deposit && !withdraw && /(급여|월급)/.test(working)));

  let method: PayMethod = "unknown";
  let instrument: string | null = null;
  const instruments = [...INSTRUMENTS].sort((a, b) => b.name.length - a.name.length);
  for (const item of instruments) {
    if (working.includes(item.name)) {
      instrument = item.name;
      method = item.method;
      break;
    }
  }
  if (/체크/.test(working)) method = "debit";
  else if (/신용/.test(working)) method = "credit";
  else if (/(입\s*통장|출\s*통장)/.test(working) && method === "unknown") method = "transfer";
  else if (/(출금|이체|송금)/.test(working) && method === "unknown") method = "transfer";
  else if (/승인/.test(working) && method === "unknown") method = "credit";

  const amountMatch = working.match(/([0-9][0-9,]*)\s*원/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let merchantSource = working.replace(amountMatch[0], " ");
  merchantSource = merchantSource.replace(
    /(?:입출금통장|모임통장|저금통|세이프박스|자유적금|(?:입|출)\s*통장)\s*[([ ]?\s*(?:\*+)?\d{4}\s*[)\]]?/g,
    " ",
  );
  merchantSource = merchantSource.replace(/\d{1,2}월\s*\d{1,2}일/g, " ");
  merchantSource = merchantSource.replace(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/g, " ");
  merchantSource = merchantSource.replace(/\d{1,2}[./]\d{1,2}/g, " ");
  merchantSource = merchantSource.replace(/\d{1,2}:\d{2}(?::\d{2})?/g, " ");
  merchantSource = merchantSource.replace(/\d+\s*개월/g, " ");
  merchantSource = merchantSource.replace(/[가-힣]{1,4}\*[가-힣]{1,4}님?/g, " ");
  merchantSource = merchantSource.replace(/[가-힣]{2,5}님/g, " ");

  const noise = [...new Set(NOISE)].sort((a, b) => b.length - a.length);
  for (const word of noise) {
    merchantSource = merchantSource.split(word).join(" ");
  }
  merchantSource = merchantSource.replace(/누적\s*[\d,]+(?:\s*원)?/g, " ");
  merchantSource = merchantSource.replace(/[\d,]+\s*원/g, " ");
  merchantSource = merchantSource.replace(/[()[\]{}<>★*·|,/:._+＋→-]/g, " ");
  merchantSource = merchantSource.replace(/\s+/g, " ").trim();

  const direction: Direction = isRefund ? "refund" : isIncome ? "income" : "expense";
  return {
    amount,
    merchant: shortMerchant(merchantSource) || "알 수 없는 사용처",
    direction,
    method,
    instrument,
    balanceAfter,
    accountLast4,
    rawText: raw.trim(),
  };
}
