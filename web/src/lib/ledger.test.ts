import { describe, expect, it } from "vitest";
import categories from "../../../shared/categories.json";
import { recurringForAccount, resolveAccount, transactionBank } from "./accounts";
import { cycleForDate, usageBetween, usageRows } from "./cardCycle";
import { categoryBreakdown } from "./analytics";
import { resolveCategoryId } from "./classify";
import { buildForecast, recurringAmount } from "./forecast";
import { clampDay } from "./format";
import { accountMark, cardMark } from "./marks";
import { merchantLabel, parseNotification, shortMerchant } from "./parseNotification";
import type { BankAccount, Category, CreditCard, Rule, Transaction } from "./types";

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

  it("keeps only the store name from a repeated card notification", () => {
    const parsed = parseNotification(
      "현대카드 승인 박성현 현대 네이버 박성현 현대 네이버 몬스터커피대전도안우미린점 4,500원 누적867,130원",
    );
    expect(parsed).toMatchObject({
      amount: 4500,
      merchant: "몬스터커피대전도안우미린점",
      direction: "expense",
      method: "credit",
      instrument: "현대카드",
    });
    expect(shortMerchant("박성현 현대 네이버 박성현 현대 네이버 몬스터커피대전도안우미린점 누적867")).toBe(
      "몬스터커피대전도안우미린점",
    );
  });

  it("shows only the store, or the account name when there is no store", () => {
    expect(shortMerchant("모임통장 모임통장 7260 지에스더프레시 대전")).toBe("지에스더프레시 대전");
    expect(shortMerchant("몬스터커피대전도안우미린점 130원")).toBe("몬스터커피대전도안우미린점");
    expect(shortMerchant("모임통장 모임통장 7260 주식회사 레진엔터테인먼트")).toBe("주식회사 레진엔터테인먼트");
    expect(shortMerchant("모임통장 모임통장 7260")).toBe("모임통장");
    expect(merchantLabel("모임통장 모임통장 7260", "생활비통장")).toBe("생활비통장");
    expect(merchantLabel("모임통장 모임통장 7260 몬스터커피대전도안우미린점 130원", "생활비통장")).toBe(
      "몬스터커피대전도안우미린점",
    );
    expect(shortMerchant("모임통장 모임통장 7260 지에스더프레시 대전 몬스터커피대전도안우미린점 130원")).toBe(
      "몬스터커피대전도안우미린점",
    );
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
    expect(categoryName("대출상환")).toBe("대출");
    expect(categoryName("대출이자")).toBe("금융");
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
        { id: "r1", name: "월세", amount: 500_000, dayOfMonth: 10, categoryId: null, accountId: null, enabled: true },
        { id: "r2", name: "보험", amount: 85_000, dayOfMonth: 3, categoryId: null, accountId: null, enabled: true },
        { id: "r3", name: "통신", amount: 69_000, dayOfMonth: 27, categoryId: null, accountId: null, enabled: true },
      ],
      recurringMarks: [],
      cards: [
        card("c1", "삼성카드", 14),
        card("c2", "현대카드", 2),
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
    expect(forecast.cardLines.find((card) => card.name === "삼성카드")?.upcoming).toBe(true);
    expect(forecast.cardPendingTotal).toBe(460_000);
    expect(forecast.afterTransfers).toBe(1_931_000);
    expect(forecast.afterCards).toBe(1_471_000);
    expect(forecast.expectedBalance).toBe(4_671_000);
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

  it("treats the 31st as the last day of a short month", () => {
    expect(clampDay(2026, 2, 31)).toBe(28);
    expect(clampDay(2024, 2, 31)).toBe(29);
    expect(clampDay(2026, 4, 31)).toBe(30);
    expect(clampDay(2026, 1, 31)).toBe(31);

    const forecast = buildForecast({
      today: { year: 2026, month: 2, day: 28 },
      balance: 1_000_000,
      payday: 25,
      salaries: [],
      recurring: [
        { id: "rent", name: "월세", amount: 100_000, dayOfMonth: 31, categoryId: null, accountId: null, enabled: true },
        { id: "old", name: "지난이체", amount: 50_000, dayOfMonth: 27, categoryId: null, accountId: null, enabled: true },
      ],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [],
    });
    expect(forecast.recurringPending.map((item) => item.name)).toEqual(["월세"]);
  });

  it("bills a 29th-to-28th cycle on the 10th two months after it starts", () => {
    const hyundai = card("hyundai", "현대카드", 10, {
      periodStartDay: 29,
      periodEndOffset: 1,
      periodEndDay: 28,
      paymentOffset: 2,
    });
    const today = { year: 2026, month: 10, day: 8 };
    const open = cycleForDate(hyundai, today);
    expect(open).toMatchObject({
      start: { year: 2026, month: 9, day: 29 },
      end: { year: 2026, month: 10, day: 28 },
      payment: { year: 2026, month: 11, day: 10 },
    });

    const forecast = buildForecast({
      today,
      balance: 1_000_000,
      payday: 25,
      salaries: [],
      recurring: [],
      recurringMarks: [],
      cards: [hyundai],
      cardMarks: [],
      transactions: [
        tx("today", 120_000, "2026-10-08T03:00:00.000Z", "hyundai"),
        tx("closed", 80_000, "2026-09-20T03:00:00.000Z", "hyundai"),
      ],
    });
    expect(forecast.cardLines[0]).toMatchObject({
      billAmount: 80_000,
      pending: true,
      paymentMonth: 10,
      paymentDay: 10,
      usageThisMonth: 120_000,
      upcoming: true,
    });
    expect(forecast.cardPendingTotal).toBe(200_000);
    expect(forecast.expectedBalance).toBe(800_000);
  });

  it("keeps reference paydays pending until a company deposit arrives", () => {
    const salaries = [
      { id: "a", year: 2026, month: 9, day: 25, amount: 2_000_000, received: true, company: "아세아제지" },
      { id: "b", year: 2026, month: 9, day: 31, amount: 500_000, received: true, company: "보너스" },
    ];
    const early = buildForecast({
      today: { year: 2026, month: 10, day: 8 },
      balance: 1_000_000,
      payday: 25,
      salaries,
      recurring: [],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [],
    });
    expect(early.salaryAmount).toBe(2_500_000);
    expect(early.expectedBalance).toBe(3_500_000);

    const later = buildForecast({
      today: { year: 2026, month: 10, day: 26 },
      balance: 1_000_000,
      payday: 25,
      salaries,
      recurring: [],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [],
    });
    expect(later.salaryLines.filter((line) => line.pending).map((line) => line.day)).toEqual([25, 31]);
    expect(later.expectedBalance).toBe(3_500_000);
  });

  it("keeps last month's other payday when this month only has one", () => {
    const forecast = buildForecast({
      today: { year: 2026, month: 10, day: 10 },
      balance: 1_000_000,
      payday: 25,
      salaries: [
        { id: "old-pay", year: 2026, month: 9, day: 25, amount: 2_000_000, received: true, company: "아세아제지", title: "급여" },
        { id: "old-bonus", year: 2026, month: 9, day: 31, amount: 500_000, received: true, company: "아세아제지", title: "상여" },
        { id: "new-pay", year: 2026, month: 10, day: 25, amount: 2_100_000, received: false, company: "아세아제지", title: "급여" },
      ],
      recurring: [],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [],
    });
    expect(forecast.salaryLines.filter((line) => line.pending).map((line) => `${line.title}:${line.day}`)).toEqual(["급여:25", "상여:31"]);
    expect(forecast.salaryAmount).toBe(2_600_000);
  });

  it("matches a deposit to the named pay item, not the other one from the same company", () => {
    const salaries = [
      { id: "pay", year: 2026, month: 9, day: 25, amount: 2_000_000, received: true, company: "아세아제지", title: "급여" },
      { id: "bonus", year: 2026, month: 9, day: 31, amount: 400_000, received: true, company: "아세아제지", title: "상여" },
    ];
    const forecast = buildForecast({
      today: { year: 2026, month: 10, day: 10 },
      balance: 3_000_000,
      payday: 25,
      salaries,
      recurring: [],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [
        {
          ...tx("pay", 2_100_000, "2026-10-09T00:10:00.000Z", null),
          merchant: "급여_아세아제지",
          direction: "income" as const,
          method: "transfer" as const,
        },
      ],
    });
    expect(forecast.salaryLines.map((line) => ({ title: line.title, pending: line.pending, amount: line.amount }))).toEqual([
      { title: "급여", pending: false, amount: 2_100_000 },
      { title: "상여", pending: true, amount: 400_000 },
    ]);
    expect(forecast.salaryAmount).toBe(400_000);
  });

  it("uses a deposit whose name ends with the company, even the day before payday", () => {
    const salaries = [{ id: "a", year: 2026, month: 9, day: 25, amount: 3_000_000, received: true, company: "아세아제지" }];
    const deposit = {
      ...tx("pay", 3_200_000, "2026-09-24T00:10:00.000Z", null),
      merchant: "급여_아세아제지",
      direction: "income" as const,
      method: "transfer" as const,
    };
    const before = buildForecast({
      today: { year: 2026, month: 10, day: 10 },
      balance: 1_000_000,
      payday: 25,
      salaries,
      recurring: [],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [deposit],
    });
    expect(before.salaryLines[0]).toMatchObject({ amount: 3_200_000, pending: true, fromDeposit: true });
    expect(before.expectedBalance).toBe(4_200_000);

    const arrived = buildForecast({
      today: { year: 2026, month: 10, day: 24 },
      balance: 4_200_000,
      payday: 25,
      salaries,
      recurring: [],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [{ ...deposit, id: "again", occurredAt: "2026-10-24T00:10:00.000Z" }],
    });
    expect(arrived.salaryPending).toBe(false);
    expect(arrived.expectedBalance).toBe(4_200_000);
  });

  it("uses this month's variable amount, then last month's", () => {
    const item = { id: "fee", name: "관리비", amount: 0, dayOfMonth: 10, categoryId: null, accountId: null, enabled: true };
    const transactions = [tx("old", 180_000, "2026-09-10T03:00:00.000Z", null)];
    transactions[0].merchant = "아파트관리비";
    const withReference = { ...item, referenceMerchant: "아파트관리비" };
    expect(recurringAmount(withReference, 2026, 10, [], transactions)).toEqual({ amount: 180_000, fromPreviousMonth: true });
    expect(
      recurringAmount(item, 2026, 10, [{ recurringId: "fee", year: 2026, month: 9, settled: null, amount: 150_000 }], []),
    ).toEqual({ amount: 150_000, fromPreviousMonth: true });
    expect(
      recurringAmount(
        item,
        2026,
        10,
        [
          { recurringId: "fee", year: 2026, month: 9, settled: null, amount: 150_000 },
          { recurringId: "fee", year: 2026, month: 10, settled: null, amount: 170_000 },
        ],
        [],
      ),
    ).toEqual({ amount: 170_000, fromPreviousMonth: false });

    const forecast = buildForecast({
      today: { year: 2026, month: 10, day: 8 },
      balance: 1_000_000,
      payday: 25,
      salaries: [],
      recurring: [withReference],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions,
    });
    expect(forecast.recurringPending[0]).toMatchObject({ amount: 180_000, variable: true, fromPreviousMonth: true });
    expect(forecast.expectedBalance).toBe(820_000);
  });

  it("uses the next matching expense and stops counting it as still due", () => {
    const item = {
      id: "fee",
      name: "관리비",
      amount: 0,
      dayOfMonth: 10,
      categoryId: null,
      accountId: null,
      enabled: true,
      referenceMerchant: "아파트관리비",
    };
    const older = tx("old", 180_000, "2026-09-10T03:00:00.000Z", null);
    older.merchant = "아파트관리비";
    const newer = tx("new", 192_000, "2026-10-08T03:00:00.000Z", null);
    newer.merchant = "모임통장 모임통장 7260 아파트관리비 192,000원";
    expect(recurringAmount(item, 2026, 10, [{ recurringId: "fee", year: 2026, month: 9, settled: null, amount: 150_000 }], [older, newer])).toEqual({
      amount: 192_000,
      fromPreviousMonth: false,
    });
    const forecast = buildForecast({
      today: { year: 2026, month: 10, day: 8 },
      balance: 1_000_000,
      payday: 25,
      salaries: [],
      recurring: [item],
      recurringMarks: [],
      cards: [],
      cardMarks: [],
      transactions: [older, newer],
    });
    expect(forecast.recurringPending).toEqual([]);
    expect(forecast.expectedBalance).toBe(1_000_000);
  });
});

describe("recurringForAccount", () => {
  const main = bank("main", "카카오뱅크", "8547", true);
  const other = bank("other", "토스뱅크", "1234", false);

  it("keeps an unassigned transfer on the main account", () => {
    const items = [
      { id: "r1", name: "월세", amount: 1, dayOfMonth: 10, categoryId: null, accountId: null, enabled: true },
      { id: "r2", name: "대출", amount: 1, dayOfMonth: 31, categoryId: null, accountId: "other", enabled: true },
    ];
    expect(recurringForAccount(items, main, [main, other]).map((item) => item.name)).toEqual(["월세"]);
    expect(recurringForAccount(items, other, [main, other]).map((item) => item.name)).toEqual(["대출"]);
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

describe("marks", () => {
  it("picks a short tile for known banks and cards", () => {
    expect(accountMark("카카오뱅크").icon).toBe("/brands/kakaobank.png");
    expect(accountMark("", "토스뱅크 1234").icon).toBe("/brands/toss.png");
    expect(cardMark("현대카드").icon).toBe("/brands/hyundaicard.png");
    expect(cardMark("삼성카드").icon).toBe("/brands/samsungcard.png");
  });
});

describe("usageRows", () => {
  it("lists the credit rows that make up the usage total", () => {
    const hyundai = card("card", "현대카드", 14);
    const rows = [
      tx("late", 500, "2026-09-01T03:00:00.000Z", "card"),
      tx("spend", 1000, "2026-10-02T03:00:00.000Z", "card"),
      { ...tx("refund", 300, "2026-10-03T03:00:00.000Z", "card"), direction: "refund" as const },
      { ...tx("other", 900, "2026-10-04T03:00:00.000Z", "other"), merchant: "다른카드" },
    ];
    const period = { start: { year: 2026, month: 10, day: 1 }, end: { year: 2026, month: 10, day: 31 } };
    expect(usageRows(hyundai, rows, period.start, period.end).map((item) => item.id)).toEqual(["spend", "refund"]);
    expect(usageBetween(hyundai, rows, period.start, period.end)).toBe(700);
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

function card(id: string, name: string, paymentDay: number, extra: Partial<CreditCard> = {}): CreditCard {
  return {
    id,
    name,
    paymentDay,
    color: "#111",
    paymentAccountId: null,
    periodStartOffset: 0,
    periodStartDay: 1,
    periodEndOffset: 0,
    periodEndDay: 31,
    paymentOffset: 1,
    ...extra,
  };
}

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
