export type Direction = "expense" | "income" | "refund";
export type PayMethod = "credit" | "debit" | "transfer" | "unknown";
export type TxSource = "notification" | "manual";
export type CategoryKind = "expense" | "income";

export type Settings = {
  mainBalance: number;
  balanceAsOf: string | null;
  payday: number;
  syncBalance: boolean;
};

export type BankAccount = {
  id: string;
  name: string;
  bankName: string;
  last4: string;
  balance: number;
  balanceAsOf: string | null;
  isMain: boolean;
  createdAt: string;
};

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  sort: number;
};

export type Rule = {
  id: string;
  categoryId: string;
  keyword: string;
};

export type Transaction = {
  id: string;
  amount: number;
  merchant: string;
  rawText: string | null;
  direction: Direction;
  method: PayMethod;
  instrument: string | null;
  cardId: string | null;
  categoryId: string | null;
  source: TxSource;
  notificationKey: string | null;
  packageName: string | null;
  appLabel: string | null;
  accountLast4: string | null;
  accountId: string | null;
  balanceAfter: number | null;
  occurredAt: string;
  excluded: boolean;
  autoCategorized: boolean;
  createdAt: string;
};

export type CreditCard = {
  id: string;
  name: string;
  paymentDay: number;
  color: string;
  paymentAccountId: string | null;
};

export type Recurring = {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;
  categoryId: string | null;
  enabled: boolean;
};

export type Salary = {
  id: string;
  year: number;
  month: number;
  amount: number;
  received: boolean;
};

export type RecurringMark = {
  recurringId: string;
  year: number;
  month: number;
  settled: boolean;
};

export type CardMark = {
  cardId: string;
  year: number;
  month: number;
  amount: number | null;
  paid: boolean | null;
};

export type LedgerSnapshot = {
  settings: Settings;
  categories: Category[];
  rules: Rule[];
  transactions: Transaction[];
  accounts: BankAccount[];
  cards: CreditCard[];
  recurring: Recurring[];
  salaries: Salary[];
  recurringMarks: RecurringMark[];
  cardMarks: CardMark[];
};

export type YMD = {
  year: number;
  month: number;
  day: number;
};
