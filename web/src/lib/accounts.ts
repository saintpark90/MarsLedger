import { createId } from "./defaults";
import { last4FromText } from "./parseNotification";
import { defaultCardCycle } from "./cardCycle";
import type { BankAccount, CreditCard, LedgerSnapshot, Recurring, Settings, Transaction } from "./types";

const BANKS: { name: string; test: (compact: string) => boolean }[] = [
  { name: "카카오뱅크", test: (compact) => compact.includes("카카오뱅크") || compact.includes("kakaobank") },
  { name: "토스뱅크", test: (compact) => compact.includes("토스뱅크") || compact.includes("tossbank") },
  { name: "케이뱅크", test: (compact) => compact.includes("케이뱅크") || compact.includes("kbank") },
  { name: "IBK기업은행", test: (compact) => compact.includes("ibk기업은행") || compact.includes("ibk") },
  { name: "기업은행", test: (compact) => compact.includes("기업은행") },
  { name: "신한은행", test: (compact) => compact.includes("신한은행") },
  { name: "국민은행", test: (compact) => compact.includes("국민은행") },
  { name: "우리은행", test: (compact) => compact.includes("우리은행") },
  { name: "하나은행", test: (compact) => compact.includes("하나은행") },
  { name: "농협은행", test: (compact) => compact.includes("농협은행") },
  { name: "NH농협", test: (compact) => compact.includes("nh농협") },
  { name: "토스", test: (compact) => compact === "토스" || compact.startsWith("토스") },
];

const PACKAGES: Record<string, string> = {
  "com.kakaobank.channel": "카카오뱅크",
  "viva.republica.toss": "토스",
  "com.kbankwith.smartbank": "케이뱅크",
  "com.shinhan.sbanking": "신한은행",
  "com.kbstar.kbbank": "국민은행",
  "com.wooribank.smart.npib": "우리은행",
  "com.kebhana.hanapush": "하나은행",
  "nh.smart.nhallone": "NH농협",
  "com.ibk.android.ionebank": "IBK기업은행",
};

export function canonicalBank(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (!compact) return null;
  return BANKS.find((bank) => bank.test(compact))?.name ?? null;
}

export function bankFromPackage(packageName: string | null | undefined): string | null {
  if (!packageName) return null;
  return PACKAGES[packageName] ?? null;
}

export function transactionBank(transaction: {
  appLabel?: string | null;
  packageName?: string | null;
  instrument?: string | null;
  method?: string | null;
}): string | null {
  const fromLabel = canonicalBank(transaction.appLabel ?? "");
  if (fromLabel) return fromLabel;
  const fromPackage = bankFromPackage(transaction.packageName);
  if (fromPackage) return fromPackage;
  if (transaction.method === "credit" || transaction.method === "debit") return null;
  return canonicalBank(transaction.instrument ?? "");
}

export function sameBank(left: string, right: string): boolean {
  const a = canonicalBank(left) ?? left.replace(/\s+/g, "");
  const b = canonicalBank(right) ?? right.replace(/\s+/g, "");
  return a.length > 0 && a.toLowerCase() === b.toLowerCase();
}

export function resolveAccount(transaction: Transaction, accounts: BankAccount[]): BankAccount | null {
  if (transaction.accountId) {
    return accounts.find((account) => account.id === transaction.accountId) ?? null;
  }
  const bank = transactionBank(transaction);
  const last4 = transaction.accountLast4 || last4FromText(transaction.rawText ?? "") || "";
  const same = bank ? accounts.filter((account) => sameBank(account.bankName, bank)) : [];
  if (last4) {
    if (bank) {
      const both = same.filter((account) => account.last4 === last4);
      if (both.length === 1) return both[0];
      if (both.length > 1) return null;
      if (same.length === 1 && !same[0].last4) return same[0];
      return null;
    }
    const byTail = accounts.filter((account) => account.last4 === last4);
    return byTail.length === 1 ? byTail[0] : null;
  }
  return same.length === 1 ? same[0] : null;
}

export type AccountSignal = { bankName: string; last4: string };

export function unseenSignals(transactions: Transaction[], accounts: BankAccount[]): AccountSignal[] {
  const found = new Map<string, AccountSignal>();
  for (const transaction of transactions) {
    if (resolveAccount(transaction, accounts)) continue;
    const bankName = transactionBank(transaction) ?? "";
    const last4 = transaction.accountLast4 || last4FromText(transaction.rawText ?? "") || "";
    if (!bankName && !last4) continue;
    const key = `${bankName}|${last4}`;
    if (!found.has(key)) found.set(key, { bankName, last4 });
  }
  return [...found.values()];
}

export function defaultAccount(settings: Settings, id = createId()): BankAccount {
  return {
    id,
    name: "메인 통장",
    bankName: "",
    last4: "",
    balance: settings.mainBalance,
    balanceAsOf: settings.balanceAsOf,
    isMain: true,
    createdAt: new Date().toISOString(),
  };
}

export function mainAccount(snap: { accounts: BankAccount[]; settings: Settings }): BankAccount {
  return snap.accounts.find((account) => account.isMain) ?? snap.accounts[0] ?? defaultAccount(snap.settings);
}

export function cardsPaidFrom(cards: CreditCard[], account: BankAccount): CreditCard[] {
  return cards.filter((card) => (card.paymentAccountId ? card.paymentAccountId === account.id : account.isMain));
}

export function mirrorMainBalance(snap: LedgerSnapshot): LedgerSnapshot {
  const main = mainAccount(snap);
  return {
    ...snap,
    settings: {
      ...snap.settings,
      mainBalance: main.balance,
      balanceAsOf: main.balanceAsOf,
    },
  };
}

export function normalizeSnapshot(snap: LedgerSnapshot): LedgerSnapshot {
  const stored = snap as LedgerSnapshot & { accounts?: BankAccount[] };
  const rawAccounts = Array.isArray(stored.accounts) ? stored.accounts : [];
  const accounts = ensureOneMain(rawAccounts.length ? rawAccounts.map(normalizeAccount) : [defaultAccount(snap.settings)]);
  const main = accounts.find((account) => account.isMain) ?? accounts[0];
  return {
    ...snap,
    accounts,
    cards: snap.cards.map((card, index) => normalizeCard(card, index)),
    recurring: (snap.recurring ?? []).map((item, index) => ({
      ...item,
      accountId: item.accountId ?? null,
      sort: item.sort ?? index,
      referenceMerchant: item.referenceMerchant ?? null,
      referenceTransactionId: item.referenceTransactionId ?? null,
    })),
    salaries: (snap.salaries ?? []).map((salary) => ({
      ...salary,
      day: salary.day && salary.day >= 1 ? salary.day : snap.settings.payday,
      company: salary.company ?? "",
      title: salary.title ?? "",
    })),
    recurringMarks: (snap.recurringMarks ?? []).map((mark) => ({ ...mark, settled: mark.settled ?? null, amount: mark.amount ?? null })),
    transactions: snap.transactions.map(normalizeTransaction),
    settings: {
      ...snap.settings,
      mainBalance: main.balance,
      balanceAsOf: main.balanceAsOf,
    },
  };
}

function ensureOneMain(accounts: BankAccount[]): BankAccount[] {
  const main = accounts.find((account) => account.isMain) ?? accounts[0];
  return accounts.map((account) => ({ ...account, isMain: account.id === main.id }));
}

function normalizeCard(card: CreditCard, index = 0): CreditCard {
  return {
    ...defaultCardCycle,
    ...card,
    sort: card.sort ?? index,
    paymentAccountId: card.paymentAccountId ?? null,
    periodStartOffset: card.periodStartOffset ?? defaultCardCycle.periodStartOffset,
    periodStartDay: card.periodStartDay ?? defaultCardCycle.periodStartDay,
    periodEndOffset: card.periodEndOffset ?? defaultCardCycle.periodEndOffset,
    periodEndDay: card.periodEndDay ?? defaultCardCycle.periodEndDay,
    paymentOffset: card.paymentOffset ?? defaultCardCycle.paymentOffset,
  };
}

function normalizeAccount(account: BankAccount): BankAccount {
  return {
    ...account,
    name: account.name || "통장",
    bankName: account.bankName ?? "",
    last4: account.last4 ?? "",
    balance: Number(account.balance ?? 0),
    balanceAsOf: account.balanceAsOf ?? null,
    isMain: Boolean(account.isMain),
    createdAt: account.createdAt ?? new Date().toISOString(),
  };
}

function normalizeTransaction(transaction: Transaction): Transaction {
  return {
    ...transaction,
    packageName: transaction.packageName ?? null,
    appLabel: transaction.appLabel ?? null,
    accountLast4: transaction.accountLast4 || last4FromText(transaction.rawText ?? "") || null,
    accountId: transaction.accountId ?? null,
  };
}

export function recurringForAccount(items: Recurring[], account: BankAccount, accounts: BankAccount[]): Recurring[] {
  const main = accounts.find((item) => item.isMain) ?? accounts[0];
  return items.filter((item) => {
    const chosen = item.accountId && accounts.some((candidate) => candidate.id === item.accountId) ? item.accountId : main?.id;
    return chosen === account.id;
  });
}

export function accountLabel(account: BankAccount): string {
  const tail = account.last4 ? ` ${account.last4}` : "";
  if (account.bankName && account.bankName !== account.name) return `${account.name} · ${account.bankName}${tail}`;
  return `${account.name}${tail}`;
}
