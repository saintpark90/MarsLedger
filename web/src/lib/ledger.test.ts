import { describe, expect, it } from "vitest";
import categories from "../../../shared/categories.json";
import { resolveAccount, transactionBank } from "./accounts";
import { categoryBreakdown } from "./analytics";
import { resolveCategoryId } from "./classify";
import { buildForecast } from "./forecast";
import { parseNotification } from "./parseNotification";
import type { BankAccount, Category, Rule, Transaction } from "./types";

const catalog: Category[] = categories.map((category, index) => ({
  id: `cat-${index}`,
  name: category.name,
  kind: category.kind as Category["kind"],
  color: category.color,
  sort: category.sort,
}));

const rules: Rule[] = categories.flatMap((category, categoryIndex) =>
  category.keywords.map((keyword, keywordIndex) => ({
    id: `rule-${categoryIndex}-${keywordIndex}`,
    categoryId: `cat-${categoryIndex}`,
    keyword,
  })),
);

function categoryName(merchant: string, direction: "expense" | "income" | "refund" = "expense") {
  const resolved = resolveCategoryId(merchant, direction, catalog, rules);
  return catalog.find((category) => category.id === resolved.categoryId)?.name;
}

describe("parseNotification", () => {
  it("reads a credit approval", () => {
    const parsed = parseNotification("[삼성카드] 10/05 14:22 승인 피자헛 35,000원 일시불");
    expect(parsed).toMatchObject({
      amount: 35000,
      merchant: "피자헛",
      direction: "expense",
      method: "credit",
      instrument: "삼성카드",
      balanceAfter: null,
    });
  });

  it("reads a debit card approval", () => {
    const parsed = parseNotification("신한카드 체크 승인 4,500원 스타벅스코리아");
    expect(parsed).toMatchObject({
      amount: 4500,
      merchant: "스타벅스코리아",
      direction: "expense",
      method: "debit",
      instrument: "신한카드",
    });
  });

  it("reads a bank withdrawal and the remaining balance", () => {
    const parsed = parseNotification("카카오뱅크 출금 120,000원 월세 잔액 2,340,000원");
    expect(parsed).toMatchObject({
      amount: 120000,
      merchant: "월세",
      direction: "expense",
      method: "transfer",
      instrument: "카카오뱅크",
      balanceAfter: 2340000,
    });
  });

  it("reads salary income", () => {
    const parsed = parseNotification("카카오뱅크 입금 3,200,000원 급여 잔액 5,540,000원");
    expect(parsed).toMatchObject({
      amount: 3200000,
      merchant: "급여",
      direction: "income",
      balanceAfter: 5540000,
    });
  });

  it("reads a masked card approval", () => {
    const parsed = parseNotification("[KB국민카드] 홍*동님 이마트 82,400원 일시불 승인");
    expect(parsed).toMatchObject({
      amount: 82400,
      merchant: "이마트",
      direction: "expense",
      method: "credit",
      instrument: "KB국민카드",
    });
  });

  it("reads a cancellation as a refund", () => {
    const parsed = parseNotification("현대카드 승인취소 35,000원 피자헛");
    expect(parsed).toMatchObject({
      amount: 35000,
      merchant: "피자헛",
      direction: "refund",
      method: "credit",
      instrument: "현대카드",
    });
  });

  it("reads a toss payment", () => {
    const parsed = parseNotification("토스 12,800원 결제 배달의민족");
    expect(parsed).toMatchObject({
      amount: 12800,
      merchant: "배달의민족",
      direction: "expense",
      instrument: "토스",
    });
  });

  it("ignores ordinary notifications", () => {
    expect(parseNotification("카카오톡 새 메시지가 도착했습니다")).toBeNull();
  });

  it("reads a kakaobank deposit that leaves the bank name off the text", () => {
    const parsed = parseNotification("최화정 → 입 통장 8547\n+300,000원\n10월 7일 15:11 · 급여");
    expect(parsed).toMatchObject({
      amount: 300000,
      merchant: "최화정 급여",
      direction: "income",
      method: "transfer",
      instrument: null,
      accountLast4: "8547",
    });
  });
});

describe("classify", () => {
  it("maps merchants to spending categories", () => {
    expect(categoryName("피자헛")).toBe("식비");
    expect(categoryName("피자헛 강남점")).toBe("식비");
    expect(categoryName("스타벅스코리아")).toBe("카페·간식");
    expect(categoryName("쿠팡이츠")).toBe("식비");
    expect(categoryName("쿠팡")).toBe("생활·쇼핑");
    expect(categoryName("넷플릭스")).toBe("문화·구독");
    expect(categoryName("서울수학학원")).toBe("교육비");
    expect(categoryName("지하철")).toBe("교통비");
    expect(categoryName("알 수 없는 가게")).toBe("기타");
  });

  it("maps salary to income", () => {
    expect(categoryName("급여", "income")).toBe("급여");
  });
});

describe("buildForecast", () => {
  it("subtracts remaining transfers and card bills, then adds unpaid salary", () => {
    const forecast = buildForecast({
      today: { year: 2026, month: 10, day: 5 },
      balance: 2_500_000,
      payday: 25,
      salaries: [{ id: "s1", year: 2026, month: 9, amount: 3_200_000, received: true }],
      recurring: [
        { id: "r1", name: "월세", amount: 500_000, dayOfMonth: 10, categoryId: null, enabled: true },
        { id: "r2", name: "보험", amount: 85_000, dayOfMonth: 3, categoryId: null, enabled: true },
        { id: "r3", name: "통신", amount: 69_000, dayOfMonth: 27, categoryId: null, enabled: true },
      ],
      recurringMarks: [],
      cards: [
        { id: "c1", name: "삼성카드", paymentDay: 14, color: "#111", paymentAccountId: null },
        { id: "c2", name: "현대카드", paymentDay: 2, color: "#222", paymentAccountId: null },
      ],
      cardMarks: [],
      transactions: [
        tx("a", 420_000, "2026-09-12T03:00:00.000Z", "c1"),
        tx("b", 150_000, "2026-09-18T03:00:00.000Z", "c2"),
        tx("c", 40_000, "2026-10-03T03:00:00.000Z", "c1"),
      ],
    });

    expect(forecast.salaryUsedPreviousMonth).toBe(true);
    expect(forecast.salaryPending).toBe(true);
    expect(forecast.salaryAmount).toBe(3_200_000);
    expect(forecast.recurringPending.map((item) => item.name)).toEqual(["월세", "통신"]);
    expect(forecast.recurringPendingTotal).toBe(569_000);
    expect(forecast.cardLines.find((card) => card.name === "삼성카드")).toMatchObject({
      billAmount: 420_000,
      pending: true,
      usageThisMonth: 40_000,
    });
    expect(forecast.cardLines.find((card) => card.name === "현대카드")?.pending).toBe(false);
    expect(forecast.cardPendingTotal).toBe(420_000);
    expect(forecast.afterTransfers).toBe(1_931_000);
    expect(forecast.afterCards).toBe(1_511_000);
    expect(forecast.expectedBalance).toBe(4_711_000);
  });

  it("does not add salary that is already marked received", () => {
    const forecast = buildForecast({
      today: { year: 2026, month: 10, day: 5 },
      balance: 1_000_000,
      payday: 25,
      salaries: [{ id: "s1", year: 2026, month: 10, amount: 3_000_000, received: true }],
      recurring: [],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [],
    });
    expect(forecast.salaryPending).toBe(false);
    expect(forecast.expectedBalance).toBe(1_000_000);
  });
});

describe("resolveAccount", () => {
  const kakao = bank("kakao", "카카오뱅크", "8547", true);
  const toss = bank("toss", "토스뱅크", "8547", false);
  const otherKakao = bank("kakao-2", "카카오뱅크", "1234", false);

  it("uses the app label together with the last four digits", () => {
    const transaction = tx("t", 300_000, "2026-10-07T06:11:00.000Z", null);
    transaction.appLabel = "카카오뱅크";
    transaction.packageName = "com.kakaobank.channel";
    transaction.accountLast4 = "8547";
    transaction.method = "transfer";
    expect(resolveAccount(transaction, [kakao, toss])?.id).toBe("kakao");
  });

  it("reads the bank from the package when the text omitted it", () => {
    const transaction = tx("t", 300_000, "2026-10-07T06:11:00.000Z", null);
    transaction.packageName = "com.kakaobank.channel";
    transaction.accountLast4 = "8547";
    transaction.method = "transfer";
    expect(transactionBank(transaction)).toBe("카카오뱅크");
    expect(resolveAccount(transaction, [bank("kakao", "카카오뱅크", "", true)])?.id).toBe("kakao");
  });

  it("does not guess when only the last four digits match two banks", () => {
    const transaction = tx("t", 300_000, "2026-10-07T06:11:00.000Z", null);
    transaction.accountLast4 = "8547";
    transaction.method = "transfer";
    expect(resolveAccount(transaction, [kakao, toss])).toBeNull();
  });

  it("distinguishes two accounts at the same bank", () => {
    const transaction = tx("t", 300_000, "2026-10-07T06:11:00.000Z", null);
    transaction.appLabel = "KakaoBank";
    transaction.accountLast4 = "1234";
    transaction.method = "transfer";
    expect(resolveAccount(transaction, [kakao, otherKakao])?.id).toBe("kakao-2");
  });
});

describe("analytics", () => {
  it("nets refunds inside the category", () => {
    const rows = categoryBreakdown(
      [
        {
          ...tx("a", 35_000, "2026-10-05T03:00:00.000Z", null),
          categoryId: "food",
          direction: "expense",
        },
        {
          ...tx("b", 10_000, "2026-10-06T03:00:00.000Z", null),
          categoryId: "food",
          direction: "refund",
          method: "credit",
        },
      ],
      [{ id: "food", name: "식비", kind: "expense", color: "#c4533a", sort: 1 }],
      2026,
      10,
    );
    expect(rows).toEqual([{ categoryId: "food", name: "식비", color: "#c4533a", amount: 25_000 }]);
  });
});

function bank(id: string, bankName: string, last4: string, isMain: boolean): BankAccount {
  return {
    id,
    name: bankName,
    bankName,
    last4,
    balance: 0,
    balanceAsOf: null,
    isMain,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

function tx(id: string, amount: number, occurredAt: string, cardId: string | null): Transaction {
  return {
    id,
    amount,
    merchant: "사용처",
    rawText: null,
    direction: "expense" as const,
    method: "credit" as const,
    instrument: null,
    cardId,
    categoryId: null,
    source: "notification" as const,
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
