import { describe, expect, it } from "vitest";
import { parseCardStatement, planImport, statementMarker, suggestCardId } from "./parseStatement";

const html = `<table>
  <tr><th colspan="6">2026년 11월 이용대금명세서(예정)</th></tr>
  <tr><th>이용일</th><th>이용카드</th><th>이용가맹점</th><th>이용금액</th><th>할부/회차</th><th>결제원금</th></tr>
  <tr><td>2026년 10월 07일</td><td>본인V 네이버 현대카드</td><td>나이스 - 쿠팡</td   ><td align="right">15,990</td><td></td><td>15,990</td></tr>
  <tr><td>2026년 10월 07일</td><td>본인V 네이버 현대카드</td><td>나이스 - 쿠팡</td><td>4,000</td><td></td><td>4,000</td></tr>
  <tr><td>2026년 09월 23일</td><td>본인L 현대카드 하이패스</td><td>한국도로공사</td><td>4,800</td><td></td><td>4,800</td></tr>
  <tr><td>2026년 08월 20일</td><td>본인V 네이버 현대카드</td><td>쿠팡페이</td><td>383,040</td><td>3/3</td><td>127,600</td></tr>
  <tr><td>-</td><td></td><td>총 합계 4건</td><td></td><td></td><td>152,390</td></tr>
</table>`;

describe("parseCardStatement", () => {
  it("reads a hyundai billing table and keeps the full installment amount once", () => {
    const parsed = parseCardStatement(html);
    expect(parsed?.title).toContain("이용대금명세서");
    expect(parsed?.rows).toHaveLength(4);
    const installment = parsed?.rows.find((row) => row.installment === "3/3");
    expect(installment).toMatchObject({ amount: 383040, billed: 127600, occurredOn: "2026-08-20", direction: "expense" });
    const sameDay = parsed?.rows.filter((row) => row.merchant.includes("쿠팡") && row.amount === 15990);
    expect(sameDay).toHaveLength(1);
    expect(parsed?.rows.filter((row) => row.amount === 4000)).toHaveLength(1);
  });

  it("suggests the closest registered card", () => {
    const cards = [
      { id: "hyundai", name: "현대카드" },
      { id: "naver", name: "네이버 현대카드" },
      { id: "hipass", name: "하이패스" },
    ];
    expect(suggestCardId("본인V 네이버 현대카드", cards)).toBe("naver");
    expect(suggestCardId("본인L 현대카드 하이패스", cards)).toBe("hipass");
    expect(suggestCardId("본인V 네이버 현대카드", [{ id: "only", name: "삼성카드" }])).toBe("only");
  });

  it("skips purchases already saved from the same statement or a matching notification", () => {
    const parsed = parseCardStatement(html);
    if (!parsed) throw new Error("fixture");
    const cardMap = { "본인V 네이버 현대카드": "naver", "본인L 현대카드 하이패스": "hipass" };
    const first = planImport(parsed.rows, parsed.rows.map(() => true), cardMap, []);
    expect(first.indexes).toHaveLength(4);

    const imported = parsed.rows[0];
    const second = planImport(parsed.rows, parsed.rows.map(() => true), cardMap, [
      {
        rawText: statementMarker(imported),
        amount: imported.amount,
        merchant: imported.merchant,
        occurredAt: `${imported.occurredOn}T12:00:00+09:00`,
        cardId: "naver",
      },
      {
        rawText: null,
        amount: 4800,
        merchant: "한국도로공사",
        occurredAt: "2026-09-23T03:00:00.000Z",
        cardId: "hipass",
      },
    ]);
    expect(second.skipped).toBe(2);
    expect(second.indexes).toHaveLength(2);
  });
});
