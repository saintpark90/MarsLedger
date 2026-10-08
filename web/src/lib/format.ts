import type { YMD } from "./types";

const SEOUL = "Asia/Seoul";

export function won(value: number): string {
  const sign = value < 0 ? "-" : "";
  const amount = Math.round(Math.abs(value)).toLocaleString("ko-KR");
  return `${sign}${amount}원`;
}

export function seoulParts(date = new Date()): YMD {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

export function seoulMonthKey(iso: string): { year: number; month: number } {
  const parts = seoulParts(new Date(iso));
  return { year: parts.year, month: parts.month };
}

export function inMonth(iso: string, year: number, month: number): boolean {
  const parts = seoulMonthKey(iso);
  return parts.year === year && parts.month === month;
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function clampDay(year: number, month: number, day: number): number {
  const last = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

export function recurringDayText(day: number): string {
  return day === 31 ? "말일" : `${day}일`;
}

export function formatKoreanDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(iso));
}

export function formatKoreanDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function monthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

export function formatKoreanYmd(date: YMD): string {
  return `${date.month}월 ${date.day}일`;
}

export function seoulDateKey(iso: string): string {
  const parts = seoulParts(new Date(iso));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseAmountInput(value: string): number {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}
