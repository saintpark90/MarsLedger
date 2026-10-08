import { useState } from "react";
import { useLedger } from "../context/LedgerContext";
import { SortableList } from "../components/Sortable";
import { AccountField, AccountThumb } from "../components/Thumbs";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";
import { accountLabel, mainAccount } from "../lib/accounts";
import { buildForecast, recurringAmount } from "../lib/forecast";
import { clampDay, formatKoreanDate, monthLabel, parseAmountInput, previousMonth, recurringDayText, seoulParts, won } from "../lib/format";
import { bySort } from "../lib/order";
import type { Recurring, Transaction } from "../lib/types";

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
          <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0이면 매달 변동" />
        </Field>
        <Field label="매달">
          <TextInput inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
        <Field label="출금 통장">
          <AccountField accounts={ledger.snap.accounts} accountId={selectedAccountId}>
            <SelectInput value={selectedAccountId} onChange={(event) => setAccountId(event.target.value)}>
              {ledger.snap.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </SelectInput>
          </AccountField>
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
              if (!name.trim() || amount.trim() === "" || value < 0 || dayOfMonth < 1 || dayOfMonth > 31) return;
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

      {ledger.snap.recurring.length === 0 && <p className="text-sm text-muted">등록된 자동이체가 없습니다.</p>}
      <SortableList items={bySort(ledger.snap.recurring)} onReorder={(ids) => void ledger.reorderRecurring(ids)}>
        {(item) => <RecurringItem item={item} pending={pending.has(item.id)} />}
      </SortableList>
    </div>
  );
}

function RecurringItem({ item, pending }: { item: Recurring; pending: boolean }) {
  const ledger = useLedger();
  const today = seoulParts();
  const main = mainAccount(ledger.snap);
  const account = ledger.snap.accounts.find((entry) => entry.id === item.accountId) ?? main;
  const category = ledger.snap.categories.find((entry) => entry.id === item.categoryId);
  const priced = recurringAmount(item, today.year, today.month, ledger.snap.recurringMarks, ledger.snap.transactions);
  const monthMark = ledger.snap.recurringMarks.find((mark) => mark.recurringId === item.id && mark.year === today.year && mark.month === today.month);
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
    <div className="sheet space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AccountThumb name={account.name} bankName={account.bankName} />
          <div>
          <p className="font-medium">
            {item.name} · 매달 {recurringDayText(item.dayOfMonth)}
          </p>
          <p className="text-sm text-muted">
            <span className="tabular">{item.amount <= 0 ? `변동 · 이번 달 ${won(priced.amount)}` : won(item.amount)}</span>
            {" · "}
            {accountLabel(account)}
            {category ? ` · ${category.name}` : ""}
            {" · "}
            {pending ? "이번 달 빠질 예정" : "이번 달 잔액에 반영된 것으로 계산"}
            {!item.enabled ? " · 꺼짐" : ""}
          </p>
          </div>
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
      {item.amount <= 0 && (
        <VariableAmount item={item} expected={monthMark?.amount ?? null} fallback={priced.amount} fromPrevious={priced.fromPreviousMonth} />
      )}
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
            <AccountField accounts={ledger.snap.accounts} accountId={accountId}>
              <SelectInput value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                {ledger.snap.accounts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {accountLabel(entry)}
                  </option>
                ))}
              </SelectInput>
            </AccountField>
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
                if (!name.trim() || amount.trim() === "" || value < 0 || dayOfMonth < 1 || dayOfMonth > 31) return;
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
    </div>
  );
}

function VariableAmount({
  item,
  expected,
  fallback,
  fromPrevious,
}: {
  item: Recurring;
  expected: number | null;
  fallback: number;
  fromPrevious: boolean;
}) {
  const ledger = useLedger();
  const today = seoulParts();
  const prev = previousMonth(today.year, today.month);
  const [amount, setAmount] = useState(expected == null ? "" : String(expected));
  const [query, setQuery] = useState("");
  const expenses = ledger.snap.transactions
    .filter((transaction) => transaction.direction === "expense" && !transaction.excluded)
    .sort((left, right) => +new Date(right.occurredAt) - +new Date(left.occurredAt));
  const shown = expenses.filter((transaction) => !query.trim() || transaction.merchant.includes(query.trim())).slice(0, 6);

  function pick(transaction: Transaction | null) {
    void ledger.updateRecurring(item.id, {
      referenceTransactionId: transaction?.id ?? null,
      referenceMerchant: transaction?.merchant ?? null,
    });
  }

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <p className="text-sm text-muted">
        매달 금액이 달라집니다. 이번 달 예상을 비우면 {fromPrevious ? `지난달 ${won(fallback)}` : "지난달 금액"}을 계산에 넣습니다.
      </p>
      <div className="grid gap-3 md:grid-cols-[180px_1fr] md:items-end">
        <Field label={`${monthLabel(today.year, today.month)} 예상`}>
          <TextInput
            inputMode="numeric"
            value={amount}
            placeholder={fromPrevious ? String(fallback) : "지난달 금액 없음"}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => {
              const next = amount.trim() ? parseAmountInput(amount) : null;
              if (next === expected) return;
              void ledger.setRecurringAmount(item.id, today.year, today.month, next);
            }}
          />
        </Field>
        <Field label="참고할 지출 내역">
          <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="사용처 검색" />
        </Field>
      </div>
      <p className="text-sm">
        참고 이름: <strong>{item.referenceMerchant || "아직 없음"}</strong>
        {item.referenceMerchant && (
          <button className="ml-2 text-pine" onClick={() => pick(null)}>
            지우기
          </button>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {shown.map((transaction) => (
          <button
            key={transaction.id}
            className="rounded-full bg-white px-3 py-1 text-left text-sm"
            onClick={() => pick(transaction)}
          >
            {transaction.merchant} · {formatKoreanDate(transaction.occurredAt)} · {won(transaction.amount)}
          </button>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted">고를 지출 내역이 없습니다.</p>}
      </div>
      <p className="text-sm text-muted">
        {monthLabel(prev.year, prev.month)}에 같은 이름으로 나간 금액이 있으면, 이번 달 예상을 비웠을 때 그 금액을 씁니다.
      </p>
    </div>
  );
}

function expenseCategories(categories: { id: string; name: string; kind: string; sort: number }[]) {
  return categories.filter((category) => category.kind === "expense").sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko"));
}
