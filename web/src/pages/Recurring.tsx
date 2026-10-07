import { useState } from "react";
import { useLedger } from "../context/LedgerContext";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";
import { cardsPaidFrom, mainAccount } from "../lib/accounts";
import { buildForecast } from "../lib/forecast";
import { monthLabel, parseAmountInput, seoulParts, won } from "../lib/format";

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
    cards: cardsPaidFrom(ledger.snap.cards, main),
    cardMarks: ledger.snap.cardMarks,
    transactions: ledger.snap.transactions,
  });
  const pending = new Set(forecast.recurringPending.map((item) => item.id));
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("10");
  const [categoryId, setCategoryId] = useState("");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">자동이체</h2>
        <p className="text-sm text-muted">
          {monthLabel(today.year, today.month)}에 아직 빠질 금액은 <strong className="tabular">{won(forecast.recurringPendingTotal)}</strong>입니다. 이체일이 오늘이거나 아직 오지 않았으면 예정으로 계산합니다.
        </p>
      </div>

      <section className="sheet grid gap-3 p-4 md:grid-cols-4">
        <Field label="이름">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="월세" />
        </Field>
        <Field label="금액">
          <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="매달">
          <TextInput inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field label="분류">
          <SelectInput value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">없음</option>
            {ledger.snap.categories
              .filter((category) => category.kind === "expense")
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </SelectInput>
        </Field>
        <div className="md:col-span-4">
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
          <li key={item.id} className="sheet flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">
                {item.name} · 매달 {item.dayOfMonth}일
              </p>
              <p className="tabular text-sm text-muted">
                {won(item.amount)} · {pending.has(item.id) ? "이번 달 빠질 예정" : "이번 달 잔액에 반영된 것으로 계산"}
                {!item.enabled ? " · 꺼짐" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
