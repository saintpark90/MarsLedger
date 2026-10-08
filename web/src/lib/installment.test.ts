import { describe, expect, it } from "vitest";
import { cyclePayingIn, usageBetween } from "./cardCycle";
import { seoulDateKey } from "./format";
import { planInstallment } from "./installment";
import type { CreditCard, Transaction } from "./types";

function hyundai(): CreditCard {
  return {
    id: "hyundai",
    name: "현대카드",
    color: "#222",
    paymentAccountId: null,
    paymentDay: 10,
    periodStartOffset: 0,
    periodStartDay: 29,
    periodEndOffset: 1,
    periodEndDay: 28,
    paymentOffset: 2,
  };
}

describe("planInstallment", () => {
  it("splits an August purchase across the next three statements", () => {
    const card = hyundai();
    const plan = planInstallment(card, "2026-08-10T03:00:00.000Z", 10_000, 3);
    expect(plan?.map((slice) => slice.statement.month)).toEqual([9, 10, 11]);
    expect(plan?.map((slice) => seoulDateKey(slice.occurredAt))).toEqual(["2026-08-10", "2026-09-10", "2026-10-10"]);
    expect(plan?.reduce((sum, slice) => sum + slice.amount, 0)).toBe(10_000);
    expect(plan?.map((slice) => slice.amount)).toEqual([3334, 3333, 3333]);

    const transactions = (plan ?? []).map((slice, index) => row(index, slice.amount, slice.occurredAt));
    const september = cyclePayingIn(card, 2026, 9);
    const november = cyclePayingIn(card, 2026, 11);
    expect(usageBetween(card, transactions, september.start, september.end)).toBe(3334);
    expect(usageBetween(card, transactions, november.start, november.end)).toBe(3333);
  });

  it("uses the following calendar statements when the card bills next month", () => {
    const card: CreditCard = {
      ...hyundai(),
      id: "samsung",
      paymentDay: 14,
      periodStartDay: 1,
      periodEndOffset: 0,
      periodEndDay: 31,
      paymentOffset: 1,
    };
    const plan = planInstallment(card, "2026-08-10T03:00:00.000Z", 9_000, 3);
    expect(plan?.map((slice) => `${slice.statement.month}월`)).toEqual(["9월", "10월", "11월"]);
    expect(plan?.every((slice) => slice.amount === 3_000)).toBe(true);
  });
});

function row(index: number, amount: number, occurredAt: string): Transaction {
  return {
    id: String(index),
    amount,
    merchant: "할부",
    rawText: null,
    direction: "expense",
    method: "credit",
    instrument: "현대카드",
    cardId: "hyundai",
    categoryId: null,
    source: "manual",
    notificationKey: null,
    packageName: null,
    appLabel: null,
    accountLast4: null,
    accountId: null,
    balanceAfter: null,
    occurredAt,
    excluded: false,
    autoCategorized: true,
    createdAt: occurredAt,
  };
}
