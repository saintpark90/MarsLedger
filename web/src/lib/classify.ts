import type { Category, Direction, Rule } from "./types";

export function classifyMerchant(merchant: string, rules: Pick<Rule, "keyword" | "categoryId">[]): string | null {
  const haystack = merchant.toLowerCase().replace(/\s+/g, "");
  if (!haystack) return null;
  const sorted = [...rules].sort((a, b) => b.keyword.length - a.keyword.length);
  for (const rule of sorted) {
    const needle = rule.keyword.toLowerCase().replace(/\s+/g, "");
    if (needle && haystack.includes(needle)) return rule.categoryId;
  }
  return null;
}

export function resolveCategoryId(
  merchant: string,
  direction: Direction,
  categories: Category[],
  rules: Rule[],
): { categoryId: string | null; autoCategorized: boolean } {
  const matchedId = classifyMerchant(merchant, rules);
  const matched = categories.find((category) => category.id === matchedId);
  const fallbackExpense = categories.find((category) => category.name === "기타" && category.kind === "expense");
  const fallbackIncome = categories.find((category) => category.name === "급여" && category.kind === "income");

  if (direction === "income") {
    if (matched && matched.kind === "income") return { categoryId: matched.id, autoCategorized: true };
    return { categoryId: fallbackIncome?.id ?? null, autoCategorized: true };
  }

  if (matched && matched.kind === "expense") return { categoryId: matched.id, autoCategorized: true };
  return { categoryId: fallbackExpense?.id ?? null, autoCategorized: true };
}
