import { useState } from "react";
import { useLedger } from "../context/LedgerContext";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";
import { accountLabel, mainAccount } from "../lib/accounts";
import { buildForecast } from "../lib/forecast";
import { clampDay, monthLabel, parseAmountInput, recurringDayText, seoulParts, won } from "../lib/format";
import type { Recurring } from "../lib/types";

export function RecurringPage() {
  const ledger = useLedger();
  const today = seoulParts();
  const main = mainAccount(ledger.snap);
  const forecast = buildForecast({
    today,
    balance: main.balance,
    payday: ledger.snap.settings.payday,
    salaries: ledger.snap.salaries,
    recurring: ledger.snap.recurring,
    recurringMarks: ledger.snap.recurringMarks,
    cards: [],
    cardMarks: [],
    transactions: [],
  });
  const pending = new Set(forecast.recurringPending.map((item) => item.id));
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("10");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(main.id);
  const selectedAccountId = ledger.snap.accounts.some((account) => account.id === accountId) ? accountId : main.id;
  const monthEnd = clampDay(today.year, today.month, 31);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">자동이체</h2>
        <p className="text-sm text-muted">
          {monthLabel(today.year, today.month)}에 아직 빠질 금액은 <strong className="tabular">{won(forecast.recurringPendingTotal)}</strong>입니다. 이체일이 오늘이거나 아직 오지 않았으면 예정으로 계산합니다. 31일은 그 달의 말일이며, 이번 달은 {monthEnd}일입니다.
        </p>
      </div>

      <section className="sheet grid gap-3 p-4 md:grid-cols-6">
        <Field label="이름">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="월세" />
        </Field>
        <Field label="금액">
          <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="매달">
          <TextInput inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field label="출금 통장">
          <SelectInput value={selectedAccountId} onChange={(event) => setAccountId(event.target.value)}>
            {ledger.snap.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="분류">
          <SelectInput value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">없음</option>
            {expenseCategories(ledger.snap.categories).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex items-end">
          <Button
            tone="ink"
            onClick={() => {
              const value = parseAmountInput(amount);
              const dayOfMonth = Number(day);
              if (!name.trim() || value <= 0 || dayOfMonth < 1 || dayOfMonth > 31) return;
              void ledger.addRecurring({
                name: name.trim(),
                amount: value,
                dayOfMonth,
                categoryId: categoryId || null,
                accountId: selectedAccountId,
                enabled: true,
              });
              setName("");
              setAmount("");
            }}
          >
            자동이체 추가
          </Button>
        </div>
      </section>

      <ul className="space-y-3">
        {ledger.snap.recurring.length === 0 && <li className="text-sm text-muted">등록된 자동이체가 없습니다.</li>}
        {ledger.snap.recurring.map((item) => (
          <RecurringItem key={item.id} item={item} pending={pending.has(item.id)} />
        ))}
      </ul>
    </div>
  );
}

function RecurringItem({ item, pending }: { item: Recurring; pending: boolean }) {
  const ledger = useLedger();
  const today = seoulParts();
  const main = mainAccount(ledger.snap);
  const account = ledger.snap.accounts.find((entry) => entry.id === item.accountId) ?? main;
  const category = ledger.snap.categories.find((entry) => entry.id === item.categoryId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(item.amount));
  const [day, setDay] = useState(String(item.dayOfMonth));
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [accountId, setAccountId] = useState(item.accountId ?? main.id);

  function beginEdit() {
    setName(item.name);
    setAmount(String(item.amount));
    setDay(String(item.dayOfMonth));
    setCategoryId(item.categoryId ?? "");
    setAccountId(item.accountId && ledger.snap.accounts.some((entry) => entry.id === item.accountId) ? item.accountId : main.id);
    setEditing(true);
  }

  return (
    <li className="sheet space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {item.name} · 매달 {recurringDayText(item.dayOfMonth)}
          </p>
          <p className="text-sm text-muted">
            <span className="tabular">{won(item.amount)}</span>
            {" · "}
            {accountLabel(account)}
            {category ? ` · ${category.name}` : ""}
            {" · "}
            {pending ? "이번 달 빠질 예정" : "이번 달 잔액에 반영된 것으로 계산"}
            {!item.enabled ? " · 꺼짐" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="ghost" onClick={beginEdit}>
            수정
          </Button>
          <Button tone="ghost" onClick={() => void ledger.updateRecurring(item.id, { enabled: !item.enabled })}>
            {item.enabled ? "끄기" : "켜기"}
          </Button>
          <Button tone="ghost" onClick={() => void ledger.setRecurringSettled(item.id, today.year, today.month, true)}>
            이미 나감
          </Button>
          <Button tone="ghost" onClick={() => void ledger.setRecurringSettled(item.id, today.year, today.month, false)}>
            아직 안 나감
          </Button>
          <Button tone="ghost" onClick={() => void ledger.setRecurringSettled(item.id, today.year, today.month, null)}>
            날짜 기준
          </Button>
          <Button tone="clay" onClick={() => void ledger.deleteRecurring(item.id)}>
            삭제
          </Button>
        </div>
      </div>
      {editing && (
        <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-6">
          <Field label="이름">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="금액">
            <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="매달">
            <TextInput inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
          </Field>
          <Field label="출금 통장">
            <SelectInput value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {ledger.snap.accounts.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {accountLabel(entry)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="분류">
            <SelectInput value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">없음</option>
              {expenseCategories(ledger.snap.categories).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="flex items-end gap-2">
            <Button
              tone="ink"
              onClick={() => {
                const value = parseAmountInput(amount);
                const dayOfMonth = Number(day);
                if (!name.trim() || value <= 0 || dayOfMonth < 1 || dayOfMonth > 31) return;
                void ledger
                  .updateRecurring(item.id, {
                    name: name.trim(),
                    amount: value,
                    dayOfMonth,
                    categoryId: categoryId || null,
                    accountId,
                  })
                  .then((saved) => {
                    if (saved) setEditing(false);
                  });
              }}
            >
              저장
            </Button>
            <Button tone="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function expenseCategories(categories: { id: string; name: string; kind: string; sort: number }[]) {
  return categories.filter((category) => category.kind === "expense").sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko"));
}
