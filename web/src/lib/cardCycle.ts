import { clampDay, seoulParts } from "./format";
import type { CreditCard, Transaction, YMD } from "./types";

export const MONTH_OFFSETS = [
  { value: 0, label: "당월" },
  { value: 1, label: "익월" },
  { value: 2, label: "+2월" },
  { value: 3, label: "+3월" },
] as const;

export const defaultCardCycle = {
  periodStartOffset: 0,
  periodStartDay: 1,
  periodEndOffset: 0,
  periodEndDay: 31,
  paymentOffset: 1,
};

export type CardCycle = {
  start: YMD;
  end: YMD;
  payment: YMD;
};

export function offsetLabel(offset: number): string {
  return MONTH_OFFSETS.find((item) => item.value === offset)?.label ?? `+${offset}월`;
}

export function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + offset;
  const nextYear = Math.floor(index / 12);
  return { year: nextYear, month: index - nextYear * 12 + 1 };
}

export function compareYmd(left: YMD, right: YMD): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

export function cardCycle(card: CreditCard, anchorYear: number, anchorMonth: number): CardCycle {
  const startMonth = addMonths(anchorYear, anchorMonth, card.periodStartOffset);
  const endMonth = addMonths(anchorYear, anchorMonth, card.periodEndOffset);
  const payMonth = addMonths(anchorYear, anchorMonth, card.paymentOffset);
  return {
    start: { ...startMonth, day: clampDay(startMonth.year, startMonth.month, card.periodStartDay) },
    end: { ...endMonth, day: clampDay(endMonth.year, endMonth.month, card.periodEndDay) },
    payment: { ...payMonth, day: clampDay(payMonth.year, payMonth.month, card.paymentDay) },
  };
}

export function cycleOrderValid(card: CreditCard): boolean {
  const cycle = cardCycle(card, 2026, 1);
  return compareYmd(cycle.end, cycle.start) >= 0 && compareYmd(cycle.payment, cycle.end) >= 0;
}

export function cycleForDate(card: CreditCard, date: YMD): CardCycle | null {
  let found: CardCycle | null = null;
  for (let delta = -12; delta <= 3; delta += 1) {
    const anchor = addMonths(date.year, date.month, delta);
    const cycle = cardCycle(card, anchor.year, anchor.month);
    if (compareYmd(date, cycle.start) < 0 || compareYmd(date, cycle.end) > 0) continue;
    if (!found || compareYmd(cycle.start, found.start) > 0) found = cycle;
  }
  return found;
}

export function cyclePayingIn(card: CreditCard, year: number, month: number): CardCycle {
  const anchor = addMonths(year, month, -card.paymentOffset);
  return cardCycle(card, anchor.year, anchor.month);
}

export function sameYmd(left: YMD, right: YMD): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function cardMatches(transaction: Transaction, card: CreditCard): boolean {
  if (transaction.cardId === card.id) return true;
  if (transaction.cardId) return false;
  if (!transaction.instrument) return false;
  const instrument = transaction.instrument.replace(/\s+/g, "");
  const name = card.name.replace(/\s+/g, "");
  return instrument.includes(name) || name.includes(instrument);
}

export function usageRows(card: CreditCard, transactions: Transaction[], start: YMD, end: YMD): Transaction[] {
  return transactions
    .filter((transaction) => {
      if (transaction.excluded || transaction.method !== "credit") return false;
      if (transaction.direction !== "expense" && transaction.direction !== "refund") return false;
      if (!cardMatches(transaction, card)) return false;
      const day = seoulParts(new Date(transaction.occurredAt));
      return compareYmd(day, start) >= 0 && compareYmd(day, end) <= 0;
    })
    .sort((left, right) => +new Date(left.occurredAt) - +new Date(right.occurredAt) || left.merchant.localeCompare(right.merchant, "ko"));
}

export function usageBetween(card: CreditCard, transactions: Transaction[], start: YMD, end: YMD): number {
  return usageRows(card, transactions, start, end).reduce((sum, transaction) => {
    return sum + (transaction.direction === "refund" ? -transaction.amount : transaction.amount);
  }, 0);
}
