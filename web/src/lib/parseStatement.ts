import { seoulDateKey } from "./format";

export type StatementRow = {
  occurredOn: string;
  statementCard: string;
  merchant: string;
  spent: number;
  billed: number;
  amount: number;
  installment: string;
  direction: "expense" | "refund";
  key: string;
};

export type StatementFile = {
  title: string;
  rows: StatementRow[];
};

type ExistingTransaction = {
  rawText: string | null;
  amount: number;
  merchant: string;
  occurredAt: string;
  cardId: string | null;
};

const HEADER_FIELDS = {
  date: ["이용일", "승인일자", "승인일", "거래일", "사용일"],
  card: ["이용카드", "카드명", "카드종류", "카드"],
  merchant: ["이용가맹점", "가맹점명", "가맹점", "사용처", "거래처"],
  spent: ["이용금액", "승인금액", "사용금액"],
  installment: ["할부/회차", "할부개월", "할부"],
  billed: ["결제원금", "청구금액", "결제금액"],
} as const;

type HeaderField = keyof typeof HEADER_FIELDS;

export function parseCardStatement(source: string): StatementFile | null {
  const rows = htmlRows(source);
  const headerIndex = rows.findIndex((row) => headerMap(row));
  if (headerIndex < 0) return null;
  const columns = headerMap(rows[headerIndex]);
  if (!columns) return null;

  const title = rows.slice(0, headerIndex).find((row) => row.length === 1 && /명세서|이용내역|승인내역/.test(row[0]))?.[0] ?? "카드 명세서";
  const parsed: StatementRow[] = [];
  const lumpCounts = new Map<string, number>();

  for (const row of rows.slice(headerIndex + 1)) {
    if (row.some((cell) => /합계|총계/.test(cell))) continue;
    const occurredOn = parseDate(cell(row, columns.date));
    const merchant = cell(row, columns.merchant);
    if (!occurredOn || !merchant) continue;
    const spent = parseMoney(cell(row, columns.spent));
    const billed = parseMoney(cell(row, columns.billed));
    const base = spent || billed;
    if (!base) continue;
    const installment = cell(row, columns.installment);
    const statementCard = cell(row, columns.card) || "카드";
    const months = installmentMonths(installment);
    const identity = `${occurredOn}|${statementCard}|${merchant}|${Math.abs(base)}|${months ? `할부${months}` : "일시불"}`;
    if (months && parsed.some((item) => item.key === identity)) continue;
    const occurrence = months ? 1 : (lumpCounts.get(identity) ?? 0) + 1;
    if (!months) lumpCounts.set(identity, occurrence);
    const negative = spent < 0 || billed < 0 || /취소|환불/.test(merchant);
    parsed.push({
      occurredOn,
      statementCard,
      merchant,
      spent: Math.abs(spent || billed),
      billed: Math.abs(billed || spent),
      amount: Math.abs(spent || billed),
      installment,
      direction: negative ? "refund" : "expense",
      key: months ? identity : `${identity}|#${occurrence}`,
    });
  }

  if (parsed.length === 0) return null;
  return { title, rows: parsed };
}

export function statementMarker(row: Pick<StatementRow, "key">): string {
  return `명세서키=${row.key.replace(/[\r\n]/g, " ")}`;
}

export function statementRaw(row: StatementRow, title: string): string {
  const lines = [
    statementMarker(row),
    title,
    row.statementCard,
    row.installment ? `할부 ${row.installment}` : "일시불",
    `이용금액 ${row.spent.toLocaleString("ko-KR")}원`,
  ];
  if (row.billed !== row.spent) lines.push(`결제원금 ${row.billed.toLocaleString("ko-KR")}원`);
  return lines.join("\n");
}

export function statementInstant(occurredOn: string): string {
  return `${occurredOn}T12:00:00+09:00`;
}

export function suggestCardId(statementCard: string, cards: { id: string; name: string }[]): string | null {
  const needle = distinctive(statementCard);
  let best: { id: string; score: number } | null = null;
  for (const card of cards) {
    const name = distinctive(card.name);
    if (!needle || !name) continue;
    if (!needle.includes(name) && !name.includes(needle)) continue;
    const score = Math.min(needle.length, name.length);
    if (!best || score > best.score) best = { id: card.id, score };
  }
  if (best) return best.id;
  return cards.length === 1 ? cards[0].id : null;
}

export function planImport(
  rows: StatementRow[],
  picked: boolean[],
  cardIdByStatement: Record<string, string>,
  transactions: ExistingTransaction[],
): { indexes: number[]; skipped: number; unassigned: number } {
  const groups = new Map<string, number[]>();
  let unassigned = 0;
  rows.forEach((row, index) => {
    if (!picked[index]) return;
    const cardId = cardIdByStatement[row.statementCard] ?? "";
    if (!cardId) {
      unassigned += 1;
      return;
    }
    const id = `${cardId}\n${row.key}`;
    groups.set(id, [...(groups.get(id) ?? []), index]);
  });

  const indexes: number[] = [];
  let skipped = 0;
  for (const [id, list] of groups) {
    const cardId = id.slice(0, id.indexOf("\n"));
    const existing = duplicateCount(rows[list[0]], cardId, transactions);
    indexes.push(...list.slice(existing));
    skipped += Math.min(existing, list.length);
  }
  indexes.sort((left, right) => left - right);
  return { indexes, skipped, unassigned };
}

export function duplicateCount(row: StatementRow, cardId: string, transactions: ExistingTransaction[]): number {
  const marker = statementMarker(row);
  let count = 0;
  for (const transaction of transactions) {
    if ((transaction.rawText ?? "").includes(marker)) {
      count += 1;
      continue;
    }
    if (transaction.cardId !== cardId || transaction.amount !== row.amount) continue;
    if (seoulDateKey(transaction.occurredAt) !== row.occurredOn) continue;
    if (!merchantsOverlap(transaction.merchant, row.merchant)) continue;
    count += 1;
  }
  return count;
}

export async function readStatementFile(file: File): Promise<StatementFile> {
  const buffer = await file.arrayBuffer();
  const texts = [new TextDecoder("utf-8").decode(buffer)];
  try {
    texts.push(new TextDecoder("euc-kr").decode(buffer));
  } catch {
    // Some runtimes have no EUC-KR decoder. UTF-8 covers the Hyundai export.
  }
  for (const text of texts) {
    const parsed = parseCardStatement(text);
    if (parsed) return parsed;
  }
  throw new Error("이용일, 이용가맹점, 금액이 있는 카드 명세서가 아닙니다. 카드사에서 받은 엑셀을 그대로 올려 주세요.");
}

function merchantsOverlap(left: string, right: string): boolean {
  const a = compactMerchant(left);
  const b = compactMerchant(right);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function compactMerchant(value: string): string {
  const core = value.split(" - ").pop() ?? value;
  return core.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function distinctive(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/본인/g, "")
    .replace(/신용카드/g, "")
    .replace(/체크카드/g, "")
    .replace(/카드/g, "");
}

function headerMap(row: string[]): Partial<Record<HeaderField, number>> | null {
  const map: Partial<Record<HeaderField, number>> = {};
  row.forEach((cellText, index) => {
    const compact = cellText.replace(/\s+/g, "");
    for (const field of Object.keys(HEADER_FIELDS) as HeaderField[]) {
      if (map[field] != null) continue;
      if (HEADER_FIELDS[field].some((alias) => compact.includes(alias.replace(/\s+/g, "")))) map[field] = index;
    }
  });
  if (map.date == null || map.merchant == null || (map.spent == null && map.billed == null)) return null;
  return map;
}

function cell(row: string[], index: number | undefined): string {
  if (index == null) return "";
  return row[index] ?? "";
}

function htmlRows(source: string): string[][] {
  const rows: string[][] = [];
  const table = source.match(/<table\b[\s\S]*?<\/table\s*>/i)?.[0] ?? source;
  for (const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)) {
      const text = decodeHtml(cellMatch[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      cells.push(text);
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseMoney(value: string): number {
  const negative = /^\s*-/.test(value) || value.includes("▲");
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const amount = Number(digits);
  if (!Number.isFinite(amount)) return 0;
  return negative ? -amount : amount;
}

function parseDate(value: string): string | null {
  const korean = value.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) return iso(korean[1], korean[2], korean[3]);
  const numeric = value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (numeric) return iso(numeric[1], numeric[2], numeric[3]);
  return null;
}

function iso(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function installmentMonths(value: string): string {
  const match = value.match(/\d+\s*\/\s*(\d+)/);
  return match?.[1] ?? "";
}
