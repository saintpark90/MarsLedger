import catalog from "../../../shared/categories.json";
import type { Category, CategoryKind, Rule } from "./types";

type CatalogItem = {
  name: string;
  kind: string;
  color: string;
  sort: number;
  keywords: string[];
};

export function createId(): string {
  return crypto.randomUUID();
}

export function buildDefaultCatalog(): { categories: Category[]; rules: Rule[] } {
  const categories: Category[] = [];
  const rules: Rule[] = [];
  for (const item of catalog as CatalogItem[]) {
    const categoryId = createId();
    const kind: CategoryKind = item.kind === "income" ? "income" : "expense";
    categories.push({ id: categoryId, name: item.name, kind, color: item.color, sort: item.sort });
    for (const keyword of item.keywords) {
      rules.push({ id: createId(), categoryId, keyword });
    }
  }
  return { categories, rules };
}
