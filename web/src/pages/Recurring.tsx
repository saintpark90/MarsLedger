import { useState } from "react";
import { useLedger } from "../context/LedgerContext";
import { SortableList } from "../components/Sortable";
import { AccountField, AccountThumb } from "../components/Thumbs";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";
import { accountLabel, mainAccount } from "../lib/accounts";
import { buildForecast, recurringAmount } from "../lib/forecast";
import { clampDay, formatKoreanDate, monthLabel, parseAmountInput, recurringDayText, seoulParts, won } from "../lib/format";
import { bySort } from "../lib/order";
import { shortMerchant } from "../lib/parseNotification";
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
    transactions: ledger.snap.transactions,
    accounts: ledger.snap.accounts,
  });
  const pending = new Set(forecast.recurringPending.map((item) => item.id));
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"fixed" | "variable">("fixed");
  const [amount, setAmount] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [day, setDay] = useState("10");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(main.id);
  const selectedAccountId = ledger.snap.accounts.some((account) => account.id === accountId) ? accountId : main.id;
  const monthEnd = clampDay(today.year, today.month, 31);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">매달 나가는 비용</h2>
        <p className="text-sm text-muted">
          자동이체와 관리비처럼 매달 빠지는 비용입니다. {monthLabel(today.year, today.month)}에 아직 빠질 금액은{" "}
          <strong className="tabular">{won(forecast.recurringPendingTotal)}</strong>입니다. 고정금액은 같은 금액을 쓰고, 변동금액은 고른 내역과 같은 소비처가 다시 들어오면 그 금액으로 계산합니다. 31일은 그 달의 말일이며, 이번 달은 {monthEnd}일입니다.
        </p>
      </div>

      <section className="sheet space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="이름">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="관리비, 월세" />
          </Field>
          <Field label="금액 방식">
            <SelectInput value={kind} onChange={(event) => setKind(event.target.value as "fixed" | "variable")}>
              <option value="fixed">고정금액</option>
              <option value="variable">변동금액</option>
            </SelectInput>
          </Field>
        </div>
        {kind === "fixed" ? (
          <Field label="금액">
            <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="매달 같은 금액" />
          </Field>
        ) : (
          <ExpenseSelect transactions={ledger.snap.transactions} value={referenceId} onChange={setReferenceId} />
        )}
        <div className="grid gap-3 md:grid-cols-3">
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
        </div>
        <div>
          <Button
            tone="ink"
            onClick={() => {
              const dayOfMonth = Number(day);
              if (!name.trim() || dayOfMonth < 1 || dayOfMonth > 31) return;
              if (kind === "fixed") {
                const value = parseAmountInput(amount);
                if (amount.trim() === "" || value <= 0) return;
                void ledger.addRecurring({
                  name: name.trim(),
                  amount: value,
                  dayOfMonth,
                  categoryId: categoryId || null,
                  accountId: selectedAccountId,
                  enabled: true,
                  referenceMerchant: null,
                  referenceTransactionId: null,
                });
              } else {
                const transaction = ledger.snap.transactions.find((item) => item.id === referenceId);
                if (!transaction) return;
                void ledger.addRecurring({
                  name: name.trim(),
                  amount: 0,
                  dayOfMonth,
                  categoryId: categoryId || null,
                  accountId: selectedAccountId,
                  enabled: true,
                  referenceTransactionId: transaction.id,
                  referenceMerchant: shortMerchant(transaction.merchant) || transaction.merchant,
                });
              }
              setName("");
              setAmount("");
              setReferenceId("");
            }}
          >
            추가
          </Button>
        </div>
      </section>

      {ledger.snap.recurring.length === 0 && <p className="text-sm text-muted">등록된 비용이 없습니다.</p>}
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
  const priced = recurringAmount(item, today.year, today.month, ledger.snap.recurringMarks, ledger.snap.transactions, ledger.snap.accounts);
  const monthMark = ledger.snap.recurringMarks.find((mark) => mark.recurringId === item.id && mark.year === today.year && mark.month === today.month);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [kind, setKind] = useState<"fixed" | "variable">(item.amount > 0 ? "fixed" : "variable");
  const [amount, setAmount] = useState(String(item.amount));
  const [referenceId, setReferenceId] = useState(item.referenceTransactionId ?? "");
  const [day, setDay] = useState(String(item.dayOfMonth));
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [accountId, setAccountId] = useState(item.accountId ?? main.id);
  const referenceName = item.referenceMerchant ? shortMerchant(item.referenceMerchant) || item.referenceMerchant : "";

  function beginEdit() {
    setName(item.name);
    setKind(item.amount > 0 ? "fixed" : "variable");
    setAmount(item.amount > 0 ? String(item.amount) : "");
    setReferenceId(item.referenceTransactionId ?? "");
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
            <span className="tabular">
              {item.amount <= 0 ? `변동${referenceName ? ` · ${referenceName}` : ""} · ${won(priced.amount)}` : won(item.amount)}
            </span>
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
        <div className="space-y-3 border-t border-line pt-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="이름">
              <TextInput value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="금액 방식">
              <SelectInput value={kind} onChange={(event) => setKind(event.target.value as "fixed" | "variable")}>
                <option value="fixed">고정금액</option>
                <option value="variable">변동금액</option>
              </SelectInput>
            </Field>
          </div>
          {kind === "fixed" ? (
            <Field label="금액">
              <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="매달 같은 금액" />
            </Field>
          ) : (
            <ExpenseSelect transactions={ledger.snap.transactions} value={referenceId} onChange={setReferenceId} />
          )}
          <div className="grid gap-3 md:grid-cols-3">
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
          </div>
          <div className="flex items-end gap-2">
            <Button
              tone="ink"
              onClick={() => {
                const dayOfMonth = Number(day);
                if (!name.trim() || dayOfMonth < 1 || dayOfMonth > 31) return;
                const transaction = ledger.snap.transactions.find((entry) => entry.id === referenceId);
                if (kind === "variable" && !transaction && !item.referenceMerchant) return;
                const value = kind === "fixed" ? parseAmountInput(amount) : 0;
                if (kind === "fixed" && (amount.trim() === "" || value <= 0)) return;
                void ledger
                  .updateRecurring(item.id, {
                    name: name.trim(),
                    amount: value,
                    dayOfMonth,
                    categoryId: categoryId || null,
                    accountId,
                    referenceTransactionId: kind === "variable" ? (transaction?.id ?? item.referenceTransactionId ?? null) : null,
                    referenceMerchant:
                      kind === "variable"
                        ? transaction
                          ? shortMerchant(transaction.merchant) || transaction.merchant
                          : item.referenceMerchant
                        : null,
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
  const [amount, setAmount] = useState(expected == null ? "" : String(expected));

  function pick(id: string) {
    const transaction = ledger.snap.transactions.find((entry) => entry.id === id) ?? null;
    void ledger.updateRecurring(item.id, {
      referenceTransactionId: transaction?.id ?? null,
      referenceMerchant: transaction ? shortMerchant(transaction.merchant) || transaction.merchant : null,
    });
  }

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <p className="text-sm text-muted">
        같은 소비처가 다시 들어오면 그 금액으로 바꿉니다. 아직 없으면 {fromPrevious ? `지난 금액 ${won(fallback)}` : "기준 내역의 금액"}으로 계산합니다.
      </p>
      <Field label={`${monthLabel(today.year, today.month)} 예상`}>
        <TextInput
          inputMode="numeric"
          value={amount}
          placeholder={fromPrevious ? String(fallback) : "들어온 내역이 없을 때"}
          onChange={(event) => setAmount(event.target.value)}
          onBlur={() => {
            const next = amount.trim() ? parseAmountInput(amount) : null;
            if (next === expected) return;
            void ledger.setRecurringAmount(item.id, today.year, today.month, next);
          }}
        />
      </Field>
      <ExpenseSelect transactions={ledger.snap.transactions} value={item.referenceTransactionId ?? ""} onChange={pick} />
      <p className="text-sm text-muted">
        기준: <strong>{item.referenceMerchant ? shortMerchant(item.referenceMerchant) || item.referenceMerchant : "아직 없음"}</strong>
        {item.referenceMerchant ? " · 이번 달에 같은 소비처가 있으면 예상보다 그 금액을 먼저 씁니다." : ""}
      </p>
    </div>
  );
}

function ExpenseSelect({
  transactions,
  value,
  onChange,
}: {
  transactions: Transaction[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const expenses = transactions
    .filter((transaction) => transaction.direction === "expense" && !transaction.excluded)
    .sort((left, right) => +new Date(right.occurredAt) - +new Date(left.occurredAt));
  const needle = query.trim();
  const shown = expenses
    .filter((transaction) => {
      if (!needle) return true;
      const place = shortMerchant(transaction.merchant) || transaction.merchant;
      return place.includes(needle) || transaction.merchant.includes(needle);
    })
    .slice(0, 40);
  const selected = expenses.find((transaction) => transaction.id === value);
  const options = selected && !shown.some((transaction) => transaction.id === selected.id) ? [selected, ...shown] : shown;

  return (
    <div className="grid gap-3">
      <Field label="기준 내역 찾기">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="소비처로 검색" />
      </Field>
      <Field label="기준 내역">
        <SelectInput value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">내역을 선택</option>
          {options.map((transaction) => (
            <option key={transaction.id} value={transaction.id}>
              {shortMerchant(transaction.merchant) || transaction.merchant} · {formatKoreanDate(transaction.occurredAt)} · {won(transaction.amount)}
            </option>
          ))}
        </SelectInput>
      </Field>
      {options.length === 0 && <p className="text-sm text-muted">고를 지출 내역이 없습니다.</p>}
    </div>
  );
}

function expenseCategories(categories: { id: string; name: string; kind: string; sort: number }[]) {
  return categories.filter((category) => category.kind === "expense").sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko"));
}
