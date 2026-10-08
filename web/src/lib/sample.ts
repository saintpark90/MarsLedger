import { resolveCategoryId } from "./classify";
import { createId } from "./defaults";
import { previousMonth } from "./format";
import type { BankAccount, CreditCard, LedgerSnapshot, Recurring, Transaction, YMD } from "./types";

function at(year: number, month: number, day: number, hour = 12): string {
  const stamp = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:10:00+09:00`;
  return new Date(stamp).toISOString();
}

function makeTx(
  snap: LedgerSnapshot,
  input: {
    amount: number;
    merchant: string;
    direction?: Transaction["direction"];
    method: Transaction["method"];
    instrument: string | null;
    cardId: string | null;
    when: string;
  },
): Transaction {
  const direction = input.direction ?? "expense";
  const resolved = resolveCategoryId(input.merchant, direction, snap.categories, snap.rules);
  return {
    id: createId(),
    amount: input.amount,
    merchant: input.merchant,
    rawText: null,
    direction,
    method: input.method,
    instrument: input.instrument,
    cardId: input.cardId,
    categoryId: resolved.categoryId,
    source: "notification",
    notificationKey: null,
    packageName: null,
    appLabel: null,
    accountLast4: null,
    accountId: null,
    balanceAfter: null,
    occurredAt: input.when,
    excluded: false,
    autoCategorized: true,
    createdAt: input.when,
  };
}

export function buildSample(base: LedgerSnapshot, today: YMD): LedgerSnapshot {
  const prev = previousMonth(today.year, today.month);
  const spendDay = Math.max(1, Math.min(today.day, 4));
  const housing = base.categories.find((category) => category.name === "주거·공과금")?.id ?? null;
  const finance = base.categories.find((category) => category.name === "금융")?.id ?? null;
  const telecom = base.categories.find((category) => category.name === "통신")?.id ?? null;
  const kakao: BankAccount = {
    id: createId(),
    name: "카카오뱅크",
    bankName: "카카오뱅크",
    last4: "8547",
    balance: 2_500_000,
    balanceAsOf: new Date().toISOString(),
    isMain: true,
    createdAt: new Date().toISOString(),
  };
  const samsung: CreditCard = {
    id: createId(),
    name: "삼성카드",
    paymentDay: 14,
    color: "#1a4f8b",
    paymentAccountId: kakao.id,
    periodStartOffset: 0,
    periodStartDay: 1,
    periodEndOffset: 0,
    periodEndDay: 31,
    paymentOffset: 1,
  };
  const hyundai: CreditCard = {
    id: createId(),
    name: "현대카드",
    paymentDay: 10,
    color: "#222222",
    paymentAccountId: kakao.id,
    periodStartOffset: 0,
    periodStartDay: 29,
    periodEndOffset: 1,
    periodEndDay: 28,
    paymentOffset: 2,
  };
  const recurring: Recurring[] = [
    { id: createId(), name: "월세", amount: 500_000, dayOfMonth: 10, categoryId: housing, accountId: kakao.id, enabled: true },
    { id: createId(), name: "보험", amount: 85_000, dayOfMonth: 3, categoryId: finance, accountId: kakao.id, enabled: true },
    { id: createId(), name: "통신", amount: 69_000, dayOfMonth: 27, categoryId: telecom, accountId: kakao.id, enabled: true },
  ];

  const transactions = [
    makeTx(base, { amount: 180_000, merchant: "이마트", method: "credit", instrument: "삼성카드", cardId: samsung.id, when: at(prev.year, prev.month, 8) }),
    makeTx(base, { amount: 35_000, merchant: "피자헛", method: "credit", instrument: "삼성카드", cardId: samsung.id, when: at(prev.year, prev.month, 12, 19) }),
    makeTx(base, { amount: 17_000, merchant: "넷플릭스", method: "credit", instrument: "삼성카드", cardId: samsung.id, when: at(prev.year, prev.month, 15) }),
    makeTx(base, { amount: 188_000, merchant: "교보문고", method: "credit", instrument: "삼성카드", cardId: samsung.id, when: at(prev.year, prev.month, 20) }),
    makeTx(base, { amount: 80_000, merchant: "올리브영", method: "credit", instrument: "현대카드", cardId: hyundai.id, when: at(prev.year, prev.month, 11) }),
    makeTx(base, { amount: 70_000, merchant: "다이소", method: "credit", instrument: "현대카드", cardId: hyundai.id, when: at(prev.year, prev.month, 18) }),
    makeTx(base, { amount: 35_000, merchant: "피자헛", method: "debit", instrument: "신한카드", cardId: null, when: at(today.year, today.month, spendDay, 13) }),
    makeTx(base, { amount: 4_500, merchant: "스타벅스", method: "debit", instrument: "신한카드", cardId: null, when: at(today.year, today.month, spendDay, 9) }),
    makeTx(base, { amount: 52_000, merchant: "쿠팡", method: "debit", instrument: "신한카드", cardId: null, when: at(today.year, today.month, spendDay, 21) }),
    makeTx(base, { amount: 1_350, merchant: "지하철", method: "debit", instrument: "티머니", cardId: null, when: at(today.year, today.month, spendDay, 8) }),
    makeTx(base, { amount: 120_000, merchant: "수학학원", method: "transfer", instrument: "카카오뱅크", cardId: null, when: at(today.year, today.month, spendDay, 11) }),
    makeTx(base, { amount: 28_000, merchant: "배달의민족", method: "credit", instrument: "삼성카드", cardId: samsung.id, when: at(today.year, today.month, spendDay, 20) }),
    makeTx(base, { amount: 12_000, merchant: "이마트", method: "credit", instrument: "삼성카드", cardId: samsung.id, when: at(today.year, today.month, spendDay, 18) }),
    makeTx(base, {
      amount: 3_200_000,
      merchant: "급여",
      direction: "income",
      method: "transfer",
      instrument: "카카오뱅크",
      cardId: null,
      when: at(prev.year, prev.month, 25, 9),
    }),
  ];

  return {
    ...base,
    settings: {
      mainBalance: 2_500_000,
      balanceAsOf: new Date().toISOString(),
      payday: 25,
      syncBalance: true,
    },
    accounts: [kakao],
    cards: [samsung, hyundai],
    recurring,
    salaries: [{ id: createId(), year: prev.year, month: prev.month, amount: 3_200_000, received: true }],
    recurringMarks: [],
    cardMarks: [],
    transactions,
  };
}
