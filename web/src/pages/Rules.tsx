import { useState } from "react";
import { SortableList } from "../components/Sortable";
import { useLedger } from "../context/LedgerContext";
import { bySort } from "../lib/order";
import { resolveCategoryId } from "../lib/classify";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";

export function RulesPage() {
  const ledger = useLedger();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState(ledger.snap.categories[0]?.id ?? "");
  const [sample, setSample] = useState("피자헛");
  const resolved = resolveCategoryId(sample, "expense", ledger.snap.categories, ledger.snap.rules);
  const resolvedName = ledger.snap.categories.find((category) => category.id === resolved.categoryId)?.name ?? "미분류";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">자동 분류</h2>
        <p className="text-sm text-muted">사용처 이름에 단어가 들어 있으면 해당 카테고리로 넣습니다. 더 긴 단어가 우선입니다.</p>
      </div>

      <section className="sheet p-4">
        <Field label="분류 시험">
          <TextInput value={sample} onChange={(event) => setSample(event.target.value)} />
        </Field>
        <p className="mt-2 text-sm">
          결과: <strong>{resolvedName}</strong>
        </p>
        <Button className="mt-3" tone="ghost" onClick={() => void ledger.reapplyRules()}>
          자동 분류 내역에 다시 적용
        </Button>
      </section>

      <section className="sheet grid gap-3 p-4 md:grid-cols-[1fr_160px_auto] md:items-end">
        <Field label="새 카테고리">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="종류">
          <SelectInput value={kind} onChange={(event) => setKind(event.target.value as "expense" | "income")}>
            <option value="expense">지출</option>
            <option value="income">수입</option>
          </SelectInput>
        </Field>
        <Button
          tone="ink"
          onClick={() => {
            if (!name.trim()) return;
            void ledger.addCategory(name.trim(), kind, kind === "income" ? "#1e6a45" : "#6f685e");
            setName("");
          }}
        >
          추가
        </Button>
      </section>

      <section className="sheet grid gap-3 p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
        <Field label="분류 단어">
          <TextInput value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="피자헛" />
        </Field>
        <Field label="카테고리">
          <SelectInput value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {ledger.snap.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Button
          tone="pine"
          onClick={() => {
            void ledger.addRule(categoryId, keyword);
            setKeyword("");
          }}
        >
          단어 추가
        </Button>
      </section>

      <SortableList items={bySort(ledger.snap.categories)} onReorder={(ids) => void ledger.reorderCategories(ids)}>
        {(category) => {
            const rules = ledger.snap.rules.filter((rule) => rule.categoryId === category.id);
            return (
              <article className="sheet p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: category.color }} />
                    {category.name}
                  </h3>
                  <Button tone="ghost" onClick={() => void ledger.deleteCategory(category.id)}>
                    삭제
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {rules.length === 0 && <p className="text-sm text-muted">단어 없음</p>}
                  {rules.map((rule) => (
                    <button key={rule.id} className="rounded-full bg-paper px-3 py-1 text-sm" onClick={() => void ledger.deleteRule(rule.id)}>
                      {rule.keyword} ×
                    </button>
                  ))}
                </div>
              </article>
            );
        }}
      </SortableList>
    </div>
  );
}
