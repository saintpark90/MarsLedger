import { inMonth, previousMonth, seoulParts } from "./format";
import type { Category, Transaction } from "./types";

export function spendingOf(transaction: Transaction): number {
  if (transaction.excluded) return 0;
  if (transaction.direction === "expense") return transaction.amount;
  if (transaction.direction === "refund") return -transaction.amount;
  return 0;
}

export function incomeOf(transaction: Transaction): number {
  if (transaction.excluded || transaction.direction !== "income") return 0;
  return transaction.amount;
}

export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  year: number,
  month: number,
): { categoryId: string; name: string; color: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (!inMonth(transaction.occurredAt, year, month)) continue;
    const amount = spendingOf(transaction);
    if (!amount) continue;
    const key = transaction.categoryId ?? "none";
    totals.set(key, (totals.get(key) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([categoryId, amount]) => {
      const category = categories.find((item) => item.id === categoryId);
      return {
        categoryId,
        name: category?.name ?? "미분류",
        color: category?.color ?? "#6f685e",
        amount,
      };
    })
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function monthlyTrend(transactions: Transaction[], end: { year: number; month: number }, months = 6) {
  const points: { key: string; label: string; expense: number; income: number }[] = [];
  let year = end.year;
  let month = end.month;
  for (let index = 0; index < months; index += 1) {
    points.push({
      key: `${year}-${month}`,
      label: `${month}월`,
      expense: transactions.reduce(
        (sum, transaction) => sum + (inMonth(transaction.occurredAt, year, month) ? spendingOf(transaction) : 0),
        0,
      ),
      income: transactions.reduce(
        (sum, transaction) => sum + (inMonth(transaction.occurredAt, year, month) ? incomeOf(transaction) : 0),
        0,
      ),
    });
    const prev = previousMonth(year, month);
    year = prev.year;
    month = prev.month;
  }
  return points.reverse();
}

export function topMerchants(transactions: Transaction[], year: number, month: number, limit = 5) {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (!inMonth(transaction.occurredAt, year, month)) continue;
    const amount = spendingOf(transaction);
    if (amount <= 0) continue;
    totals.set(transaction.merchant, (totals.get(transaction.merchant) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function monthOptions(transactions: Transaction[], today = seoulParts()): { year: number; month: number }[] {
  const keys = new Set<string>([`${today.year}-${today.month}`]);
  for (const transaction of transactions) {
    const parts = seoulParts(new Date(transaction.occurredAt));
    keys.add(`${parts.year}-${parts.month}`);
  }
  return [...keys]
    .map((key) => {
      const [year, month] = key.split("-").map(Number);
      return { year, month };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}
