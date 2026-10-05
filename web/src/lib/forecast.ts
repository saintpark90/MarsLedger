import { clampDay, inMonth, previousMonth } from "./format";
import type { CardMark, CreditCard, Recurring, RecurringMark, Salary, Transaction, YMD } from "./types";

export type Forecast = {
  balance: number;
  salaryAmount: number;
  salaryPending: boolean;
  salaryUsedPreviousMonth: boolean;
  salaryKnown: boolean;
  recurringPending: { id: string; name: string; amount: number; dayOfMonth: number }[];
  recurringPendingTotal: number;
  afterTransfers: number;
  cardLines: {
    id: string;
    name: string;
    color: string;
    paymentDay: number;
    billAmount: number;
    pending: boolean;
    usageThisMonth: number;
  }[];
  cardPendingTotal: number;
  afterCards: number;
  expectedBalance: number;
};

function cardMatches(transaction: Transaction, card: CreditCard): boolean {
  if (transaction.cardId === card.id) return true;
  if (transaction.cardId) return false;
  if (!transaction.instrument) return false;
  const instrument = transaction.instrument.replace(/\s+/g, "");
  const name = card.name.replace(/\s+/g, "");
  return instrument.includes(name) || name.includes(instrument);
}

function creditEffect(transaction: Transaction, card: CreditCard, year: number, month: number): number {
  if (transaction.excluded || transaction.method !== "credit") return 0;
  if (!cardMatches(transaction, card)) return 0;
  if (!inMonth(transaction.occurredAt, year, month)) return 0;
  if (transaction.direction === "expense") return transaction.amount;
  if (transaction.direction === "refund") return -transaction.amount;
  return 0;
}

export function buildForecast(input: {
  today: YMD;
  balance: number;
  payday: number;
  salaries: Salary[];
  recurring: Recurring[];
  recurringMarks: RecurringMark[];
  cards: CreditCard[];
  cardMarks: CardMark[];
  transactions: Transaction[];
}): Forecast {
  const { today, balance, salaries, recurring, recurringMarks, cards, cardMarks, transactions } = input;
  const current = salaries.find((salary) => salary.year === today.year && salary.month === today.month);
  const prev = previousMonth(today.year, today.month);
  const previous = salaries.find((salary) => salary.year === prev.year && salary.month === prev.month);
  const salaryUsedPreviousMonth = !current;
  const salaryAmount = current ? current.amount : (previous?.amount ?? 0);
  const salaryKnown = Boolean(current || previous);
  const salaryPending = current ? !current.received : today.day <= clampDay(today.year, today.month, input.payday);

  const recurringPending = recurring
    .filter((item) => item.enabled)
    .filter((item) => {
      const mark = recurringMarks.find(
        (entry) => entry.recurringId === item.id && entry.year === today.year && entry.month === today.month,
      );
      if (mark) return !mark.settled;
      return today.day <= clampDay(today.year, today.month, item.dayOfMonth);
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      dayOfMonth: item.dayOfMonth,
    }));
  const recurringPendingTotal = recurringPending.reduce((sum, item) => sum + item.amount, 0);

  const cardLines = cards.map((card) => {
    const mark = cardMarks.find((entry) => entry.cardId === card.id && entry.year === today.year && entry.month === today.month);
    const billAmount =
      mark?.amount != null
        ? mark.amount
        : transactions.reduce((sum, transaction) => sum + creditEffect(transaction, card, prev.year, prev.month), 0);
    const pending = mark?.paid != null ? !mark.paid : today.day <= clampDay(today.year, today.month, card.paymentDay);
    const usageThisMonth = transactions.reduce(
      (sum, transaction) => sum + creditEffect(transaction, card, today.year, today.month),
      0,
    );
    return {
      id: card.id,
      name: card.name,
      color: card.color,
      paymentDay: card.paymentDay,
      billAmount,
      pending,
      usageThisMonth,
    };
  });
  const cardPendingTotal = cardLines.filter((line) => line.pending).reduce((sum, line) => sum + line.billAmount, 0);
  const afterTransfers = balance - recurringPendingTotal;
  const afterCards = afterTransfers - cardPendingTotal;
  const expectedBalance = afterCards + (salaryPending ? salaryAmount : 0);

  return {
    balance,
    salaryAmount,
    salaryPending,
    salaryUsedPreviousMonth,
    salaryKnown,
    recurringPending,
    recurringPendingTotal,
    afterTransfers,
    cardLines,
    cardPendingTotal,
    afterCards,
    expectedBalance,
  };
}
