import { compareYmd, cycleForDate, cyclePayingIn, usageBetween } from "./cardCycle";
import { clampDay, inMonth, previousMonth } from "./format";
import type { CardMark, CreditCard, Recurring, RecurringMark, Salary, Transaction, YMD } from "./types";

export type ForecastSalary = {
  id: string;
  day: number;
  amount: number;
  pending: boolean;
  usedPreviousMonth: boolean;
};

export type ForecastRecurring = {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;
  variable: boolean;
  fromPreviousMonth: boolean;
};

export type Forecast = {
  balance: number;
  salaryAmount: number;
  salaryPending: boolean;
  salaryUsedPreviousMonth: boolean;
  salaryKnown: boolean;
  salaryLines: ForecastSalary[];
  recurringPending: ForecastRecurring[];
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
  const salaryLines = salariesForMonth(salaries, today, input.payday);
  const salaryUsedPreviousMonth = salaryLines.some((line) => line.usedPreviousMonth);
  const salaryAmount = salaryLines.filter((line) => line.pending).reduce((sum, line) => sum + line.amount, 0);
  const salaryKnown = salaryLines.length > 0;
  const salaryPending = salaryAmount > 0;

  const recurringPending = recurring
    .filter((item) => item.enabled)
    .filter((item) => stillDue(item, today, recurringMarks))
    .map((item) => {
      const priced = recurringAmount(item, today.year, today.month, recurringMarks, transactions);
      return {
        id: item.id,
        name: item.name,
        amount: priced.amount,
        dayOfMonth: item.dayOfMonth,
        variable: item.amount <= 0,
        fromPreviousMonth: priced.fromPreviousMonth,
      };
    });
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
  const cardPendingTotal = cardLines.reduce((sum, line) => {
    const dueThisMonth = line.pending ? line.billAmount : 0;
    const spentAhead = line.upcoming ? line.usageThisMonth : 0;
    return sum + dueThisMonth + spentAhead;
  }, 0);
  const afterTransfers = balance - recurringPendingTotal;
  const afterCards = afterTransfers - cardPendingTotal;
  const expectedBalance = afterCards + (salaryPending ? salaryAmount : 0);

  return {
    balance,
    salaryAmount,
    salaryPending,
    salaryUsedPreviousMonth,
    salaryKnown,
    salaryLines,
    recurringPending,
    recurringPendingTotal,
    afterTransfers,
    cardLines,
    cardPendingTotal,
    afterCards,
    expectedBalance,
  };
}

export function recurringAmount(
  item: Recurring,
  year: number,
  month: number,
  marks: RecurringMark[],
  transactions: Transaction[],
): { amount: number; fromPreviousMonth: boolean } {
  if (item.amount > 0) return { amount: item.amount, fromPreviousMonth: false };
  const current = marks.find((mark) => mark.recurringId === item.id && mark.year === year && mark.month === month);
  if (current?.amount != null) return { amount: current.amount, fromPreviousMonth: false };
  const prev = previousMonth(year, month);
  const previous = marks.find((mark) => mark.recurringId === item.id && mark.year === prev.year && mark.month === prev.month);
  if (previous?.amount != null) return { amount: previous.amount, fromPreviousMonth: true };
  const referenced = referencedAmount(item, prev.year, prev.month, transactions);
  if (referenced != null) return { amount: referenced, fromPreviousMonth: true };
  return { amount: 0, fromPreviousMonth: false };
}

function stillDue(item: Recurring, today: YMD, marks: RecurringMark[]): boolean {
  const mark = marks.find((entry) => entry.recurringId === item.id && entry.year === today.year && entry.month === today.month);
  if (mark?.settled != null) return !mark.settled;
  return today.day <= clampDay(today.year, today.month, item.dayOfMonth);
}

function salariesForMonth(salaries: Salary[], today: YMD, payday: number): ForecastSalary[] {
  const current = salaries.filter((salary) => salary.year === today.year && salary.month === today.month);
  const prev = previousMonth(today.year, today.month);
  const previous = salaries.filter((salary) => salary.year === prev.year && salary.month === prev.month);
  const source = current.length > 0 ? current : previous;
  const usedPreviousMonth = current.length === 0 && previous.length > 0;
  return source.map((salary) => {
    const day = clampDay(today.year, today.month, salary.day && salary.day >= 1 ? salary.day : payday);
    const pending = usedPreviousMonth ? today.day <= day : !salary.received;
    return { id: salary.id, day, amount: salary.amount, pending, usedPreviousMonth };
  });
}

function referencedAmount(item: Recurring, year: number, month: number, transactions: Transaction[]): number | null {
  const named =
    item.referenceMerchant ?? transactions.find((transaction) => transaction.id === item.referenceTransactionId)?.merchant ?? "";
  const merchant = named.replace(/\s+/g, "");
  if (!merchant) return null;
  const matches = transactions.filter(
    (transaction) =>
      transaction.direction === "expense" &&
      !transaction.excluded &&
      inMonth(transaction.occurredAt, year, month) &&
      transaction.merchant.replace(/\s+/g, "") === merchant,
  );
  if (matches.length === 0) return null;
  return matches.reduce((sum, transaction) => sum + transaction.amount, 0);
}
