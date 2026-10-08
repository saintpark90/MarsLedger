import { addMonths, cardCycle, compareYmd, cycleForDate, cyclePayingIn } from "./cardCycle";
import { clampDay, seoulParts } from "./format";
import type { CreditCard, YMD } from "./types";

export type InstallmentSlice = {
  amount: number;
  occurredAt: string;
  round: number;
  months: number;
  statement: YMD;
};

export function planInstallment(card: CreditCard, occurredAt: string, total: number, months: number): InstallmentSlice[] | null {
  if (!Number.isInteger(months) || months < 2 || months > 36) return null;
  if (!Number.isInteger(total) || total < months) return null;
  const purchase = seoulParts(new Date(occurredAt));
  const clock = seoulClock(occurredAt);
  const first = cycleForDate(card, purchase);
  const amounts = splitAmount(total, months);
  return amounts.map((amount, index) => {
    const cycle = first ? cyclePayingIn(card, ...monthOf(addMonths(first.payment.year, first.payment.month, index))) : null;
    const day = index === 0 ? purchase : cycle ? dateInside(cycle, purchase.day) : shiftedDay(purchase, index);
    const shifted = addMonths(purchase.year, purchase.month, index + 1);
    const statement = cycle?.payment ?? { ...shifted, day: clampDay(shifted.year, shifted.month, card.paymentDay) };
    return {
      amount,
      occurredAt: index === 0 ? occurredAt : atSeoul(day, clock),
      round: index + 1,
      months,
      statement,
    };
  });
}

export function splitAmount(total: number, months: number): number[] {
  const base = Math.floor(total / months);
  const remainder = total - base * months;
  return Array.from({ length: months }, (_, index) => base + (index === 0 ? remainder : 0));
}

function monthOf(value: { year: number; month: number }): [number, number] {
  return [value.year, value.month];
}

function shiftedDay(purchase: YMD, offset: number): YMD {
  const next = addMonths(purchase.year, purchase.month, offset);
  return { ...next, day: clampDay(next.year, next.month, purchase.day) };
}

function dateInside(cycle: ReturnType<typeof cardCycle>, day: number): YMD {
  let year = cycle.start.year;
  let month = cycle.start.month;
  const last = cycle.end.year * 12 + cycle.end.month;
  while (year * 12 + month <= last) {
    const candidate = { year, month, day: clampDay(year, month, day) };
    if (compareYmd(candidate, cycle.start) >= 0 && compareYmd(candidate, cycle.end) <= 0) return candidate;
    const next = addMonths(year, month, 1);
    year = next.year;
    month = next.month;
  }
  return cycle.start;
}

function seoulClock(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("hour")}:${pick("minute")}`;
}

function atSeoul(day: YMD, clock: string): string {
  const month = String(day.month).padStart(2, "0");
  const date = String(day.day).padStart(2, "0");
  return `${day.year}-${month}-${date}T${clock}:00+09:00`;
}
