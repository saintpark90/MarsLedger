import { compareYmd, cycleForDate, cyclePayingIn, usageBetween } from "./cardCycle";
import { clampDay, previousMonth } from "./format";
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
    paymentMonth: number;
    paymentYear: number;
    billAmount: number;
    pending: boolean;
    usageThisMonth: number;
    openStart: YMD;
    openEnd: YMD;
    openPayment: YMD;
    upcoming: boolean;
  }[];
  cardPendingTotal: number;
  afterCards: number;
  expectedBalance: number;
};

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
    const paying = cyclePayingIn(card, today.year, today.month);
    const open = cycleForDate(card, today) ?? paying;
    const mark = cardMarks.find((entry) => entry.cardId === card.id && entry.year === today.year && entry.month === today.month);
    const billAmount = mark?.amount != null ? mark.amount : usageBetween(card, transactions, paying.start, paying.end);
    const pending = mark?.paid != null ? !mark.paid : compareYmd(today, paying.payment) <= 0;
    const usageThisMonth = usageBetween(card, transactions, open.start, open.end);
    const upcoming = compareYmd(open.payment, paying.payment) > 0 && compareYmd(today, open.payment) <= 0;
    return {
      id: card.id,
      name: card.name,
      color: card.color,
      paymentDay: paying.payment.day,
      paymentMonth: paying.payment.month,
      paymentYear: paying.payment.year,
      billAmount,
      pending,
      usageThisMonth,
      openStart: open.start,
      openEnd: open.end,
      openPayment: open.payment,
      upcoming,
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
