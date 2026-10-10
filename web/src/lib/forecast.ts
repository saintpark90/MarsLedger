import { compareYmd, cycleForDate, cyclePayingIn, usageBetween } from "./cardCycle";
import { clampDay, inMonth, previousMonth } from "./format";
import { shortMerchant } from "./parseNotification";
import type { CardMark, CreditCard, Recurring, RecurringMark, Salary, Transaction, YMD } from "./types";

export type ForecastSalary = {
  id: string;
  title: string;
  day: number;
  amount: number;
  pending: boolean;
  usedPreviousMonth: boolean;
  fromDeposit: boolean;
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
  const salaryLines = salariesForMonth(salaries, today, input.payday, transactions);
  const salaryUsedPreviousMonth = salaryLines.some((line) => line.usedPreviousMonth);
  const salaryAmount = salaryLines.filter((line) => line.pending).reduce((sum, line) => sum + line.amount, 0);
  const salaryKnown = salaryLines.length > 0;
  const salaryPending = salaryAmount > 0;

  const recurringPending = recurring
    .filter((item) => item.enabled)
    .filter((item) => {
      const mark = recurringMarks.find((entry) => entry.recurringId === item.id && entry.year === today.year && entry.month === today.month);
      if (mark?.settled != null) return !mark.settled;
      if (item.amount <= 0 && referencedAmount(item, today.year, today.month, transactions) != null) return false;
      return stillDue(item, today, recurringMarks);
    })
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
  const currentSpend = referencedAmount(item, year, month, transactions);
  if (currentSpend != null) return { amount: currentSpend, fromPreviousMonth: false };
  const current = marks.find((mark) => mark.recurringId === item.id && mark.year === year && mark.month === month);
  if (current?.amount != null) return { amount: current.amount, fromPreviousMonth: false };
  const prev = previousMonth(year, month);
  const previous = marks.find((mark) => mark.recurringId === item.id && mark.year === prev.year && mark.month === prev.month);
  if (previous?.amount != null) return { amount: previous.amount, fromPreviousMonth: true };
  const referenced = referencedAmount(item, prev.year, prev.month, transactions);
  if (referenced != null) return { amount: referenced, fromPreviousMonth: true };
  const picked = transactions.find((transaction) => transaction.id === item.referenceTransactionId && !transaction.excluded);
  if (picked) return { amount: picked.amount, fromPreviousMonth: true };
  return { amount: 0, fromPreviousMonth: false };
}

function stillDue(item: Recurring, today: YMD, marks: RecurringMark[]): boolean {
  const mark = marks.find((entry) => entry.recurringId === item.id && entry.year === today.year && entry.month === today.month);
  if (mark?.settled != null) return !mark.settled;
  return today.day <= clampDay(today.year, today.month, item.dayOfMonth);
}

function salariesForMonth(salaries: Salary[], today: YMD, payday: number, transactions: Transaction[]): ForecastSalary[] {
  const current = salaries.filter((salary) => salary.year === today.year && salary.month === today.month);
  const prev = previousMonth(today.year, today.month);
  const previous = salaries.filter((salary) => salary.year === prev.year && salary.month === prev.month);
  const chosen = new Map<number, { salary: Salary; fromPrevious: boolean }>();
  for (const salary of previous) chosen.set(paydayOf(salary, payday), { salary, fromPrevious: true });
  for (const salary of current) chosen.set(paydayOf(salary, payday), { salary, fromPrevious: false });
  const source = [...chosen.values()].sort((left, right) => paydayOf(left.salary, payday) - paydayOf(right.salary, payday));
  const deposits = depositsBySalary(source.map((entry) => entry.salary), transactions);
  return source.map(({ salary, fromPrevious }) => {
    const day = clampDay(today.year, today.month, paydayOf(salary, payday));
    const matched = deposits.get(salary.id) ?? [];
    const latest = latestOf(matched);
    const arrived = matched.some((transaction) => inMonth(transaction.occurredAt, today.year, today.month));
    const pending = arrived ? false : fromPrevious ? true : !salary.received;
    return {
      id: salary.id,
      title: salary.title?.trim() || "급여",
      day,
      amount: latest?.amount ?? salary.amount,
      pending,
      usedPreviousMonth: fromPrevious,
      fromDeposit: Boolean(latest),
    };
  });
}

function paydayOf(salary: Salary, payday: number): number {
  return salary.day && salary.day >= 1 ? salary.day : payday;
}

export function latestSalaryDeposit(salary: Salary, peers: Salary[], transactions: Transaction[]): Transaction | null {
  return latestOf(depositsBySalary(peers, transactions).get(salary.id) ?? []);
}

function depositsBySalary(salaries: Salary[], transactions: Transaction[]): Map<string, Transaction[]> {
  const grouped = new Map<string, Transaction[]>(salaries.map((salary) => [salary.id, []]));
  for (const transaction of transactions) {
    if (transaction.direction !== "income" || transaction.excluded) continue;
    const owner = salaries.reduce<Salary | null>((best, salary) => {
      const score = depositScore(salary, transaction.merchant);
      if (score <= 0) return best;
      return score > depositScore(best, transaction.merchant) ? salary : best;
    }, null);
    if (owner) grouped.get(owner.id)?.push(transaction);
  }
  return grouped;
}

function latestOf(transactions: Transaction[]): Transaction | null {
  return [...transactions].sort((left, right) => +new Date(right.occurredAt) - +new Date(left.occurredAt))[0] ?? null;
}

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

function depositScore(salary: Salary | null, merchant: string): number {
  if (!salary) return 0;
  const company = compact(salary.company ?? "");
  const text = compact(merchant);
  if (!company || !text.endsWith(company)) return 0;
  const name = compact(salary.title ?? "");
  if (name && text.includes(name)) return 1000 + company.length + name.length;
  return company.length;
}

function placeKey(value: string): string {
  return shortMerchant(value).replace(/\s+/g, "");
}

function referencedAmount(item: Recurring, year: number, month: number, transactions: Transaction[]): number | null {
  const named =
    item.referenceMerchant ?? transactions.find((transaction) => transaction.id === item.referenceTransactionId)?.merchant ?? "";
  const merchant = placeKey(named);
  if (!merchant) return null;
  const matches = transactions.filter(
    (transaction) =>
      transaction.direction === "expense" &&
      !transaction.excluded &&
      inMonth(transaction.occurredAt, year, month) &&
      placeKey(transaction.merchant) === merchant,
  );
  return latestOf(matches)?.amount ?? null;
}
