import { useMemo, useState } from "react";
import { useLedger, type NewTransaction } from "../context/LedgerContext";
import { accountLabel, mainAccount, resolveAccount, transactionBank } from "../lib/accounts";
import { parseNotification } from "../lib/parseNotification";
import { formatKoreanDate, monthLabel, parseAmountInput, seoulDateKey, seoulParts, won } from "../lib/format";
import { monthOptions } from "../lib/analytics";
import type { BankAccount, Direction, PayMethod, Transaction } from "../lib/types";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";

const methods: { value: PayMethod; label: string }[] = [
  { value: "credit", label: "신용카드" },
  { value: "debit", label: "체크카드" },
  { value: "transfer", label: "계좌" },
  { value: "unknown", label: "기타" },
];

export function TransactionsPage() {
  const ledger = useLedger();
  const today = seoulParts();
  const [month, setMonth] = useState(`${today.year}-${today.month}`);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [raw, setRaw] = useState("");
  const options = monthOptions(ledger.snap.transactions, today);

  const visible = useMemo(() => {
    return [...ledger.snap.transactions]
      .filter((transaction) => {
        if (month === "all") return true;
        const [year, monthNumber] = month.split("-").map(Number);
        const key = seoulDateKey(transaction.occurredAt);
        return key.startsWith(`${year}-${String(monthNumber).padStart(2, "0")}`);
      })
      .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
  }, [ledger.snap.transactions, month]);

  const groups = new Map<string, Transaction[]>();
  for (const transaction of visible) {
    const key = seoulDateKey(transaction.occurredAt);
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  async function addParsed() {
    const parsed = parseNotification(raw);
    if (!parsed) {
      window.alert("금액과 승인/출금/입금 같은 금융 알림 형식이 아닙니다.");
      return;
    }
    const saved = await ledger.addTransaction({
      amount: parsed.amount,
      merchant: parsed.merchant,
      rawText: parsed.rawText,
      direction: parsed.direction,
      method: parsed.method,
      instrument: parsed.instrument,
      accountLast4: parsed.accountLast4,
      balanceAfter: parsed.balanceAfter,
      source: "notification",
      occurredAt: new Date().toISOString(),
    });
    if (!saved) return;
    setRaw("");
    if (parsed.balanceAfter != null && ledger.snap.settings.syncBalance) {
      const draft: Transaction = {
        id: "draft",
        amount: parsed.amount,
        merchant: parsed.merchant,
        rawText: parsed.rawText,
        direction: parsed.direction,
        method: parsed.method,
        instrument: parsed.instrument,
        cardId: null,
        categoryId: null,
        source: "notification",
        notificationKey: null,
        packageName: null,
        appLabel: null,
        accountLast4: parsed.accountLast4,
        accountId: null,
        balanceAfter: parsed.balanceAfter,
        occurredAt: new Date().toISOString(),
        excluded: false,
        autoCategorized: true,
        createdAt: new Date().toISOString(),
      };
      const matched = resolveAccount(draft, ledger.snap.accounts);
      const target = matched ?? (transactionBank(draft) ? null : mainAccount(ledger.snap));
      if (!target) return;
      const apply = window.confirm(`알림의 잔액 ${won(parsed.balanceAfter)}으로 ${target.name}을 맞출까요?`);
      if (apply) {
        await ledger.updateAccount(target.id, { balance: parsed.balanceAfter, balanceAsOf: new Date().toISOString() });
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">내역</h2>
          <p className="text-sm text-muted">휴대폰 알림과 직접 입력이 같은 장부에 모입니다.</p>
        </div>
        <SelectInput className="w-auto" value={month} onChange={(event) => setMonth(event.target.value)}>
          <option value="all">전체 기간</option>
          {options.map((option) => (
            <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
              {monthLabel(option.year, option.month)}
            </option>
          ))}
        </SelectInput>
      </div>

      <section className="sheet space-y-3 p-4">
        <Field label="알림 문구로 추가">
          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder="[삼성카드] 10/05 14:22 승인 피자헛 35,000원 일시불"
            className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-pine"
          />
        </Field>
        <div className="flex gap-2">
          <Button tone="ink" onClick={() => void addParsed()}>
            알림 반영
          </Button>
          <Button tone="ghost" onClick={() => setShowManual((value) => !value)}>
            직접 입력
          </Button>
        </div>
        {showManual && <ManualForm onClose={() => setShowManual(false)} />}
      </section>

      {[...groups.entries()].map(([day, rows]) => (
        <section key={day}>
          <h3 className="mb-2 text-sm text-muted">{formatKoreanDate(rows[0].occurredAt)}</h3>
          <ul className="sheet divide-y divide-line">
            {rows.map((transaction) => (
              <li key={transaction.id}>
                <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpenId(openId === transaction.id ? null : transaction.id)}>
                  <span>
                    <span className="block font-medium">{transaction.merchant}</span>
                    <span className="text-sm text-muted">
                      {ledger.snap.categories.find((category) => category.id === transaction.categoryId)?.name ?? "미분류"}
                      {" · "}
                      {methods.find((method) => method.value === transaction.method)?.label}
                      {placeOf(transaction, ledger.snap.accounts) ? ` · ${placeOf(transaction, ledger.snap.accounts)}` : ""}
                    </span>
                  </span>
                  <span className={`tabular font-medium ${transaction.direction === "income" ? "text-pine" : "text-ink"}`}>
                    {transaction.direction === "income" ? "+" : transaction.direction === "refund" ? "−" : ""}
                    {won(transaction.amount)}
                  </span>
                </button>
                {openId === transaction.id && <TransactionEditor transaction={transaction} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {visible.length === 0 && <p className="text-sm text-muted">이 기간의 내역이 없습니다.</p>}
    </div>
  );
}

function ManualForm({ onClose }: { onClose: () => void }) {
  const ledger = useLedger();
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [direction, setDirection] = useState<Direction>("expense");
  const [method, setMethod] = useState<PayMethod>("debit");
  const [when, setWhen] = useState(seoulInputValue(new Date()));

  async function save() {
    const input: NewTransaction = {
      amount: parseAmountInput(amount),
      merchant: merchant.trim() || "직접 입력",
      direction,
      method,
      source: "manual",
      occurredAt: new Date(`${when}:00+09:00`).toISOString(),
    };
    if (input.amount <= 0) return;
    const saved = await ledger.addTransaction(input);
    if (saved) onClose();
  }

  return (
    <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
      <Field label="금액">
        <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <Field label="사용처">
        <TextInput value={merchant} onChange={(event) => setMerchant(event.target.value)} />
      </Field>
      <Field label="구분">
        <SelectInput value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
          <option value="expense">지출</option>
          <option value="income">수입</option>
          <option value="refund">취소</option>
        </SelectInput>
      </Field>
      <Field label="수단">
        <SelectInput value={method} onChange={(event) => setMethod(event.target.value as PayMethod)}>
          {methods.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="시각">
        <TextInput type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
      </Field>
      <div className="flex items-end">
        <Button tone="pine" onClick={() => void save()}>
          저장
        </Button>
      </div>
    </div>
  );
}

function TransactionEditor({ transaction }: { transaction: Transaction }) {
  const ledger = useLedger();
  const [merchant, setMerchant] = useState(transaction.merchant);
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [accountId, setAccountId] = useState(transaction.accountId ?? "");
  const bank = transactionBank(transaction);
  return (
    <div className="space-y-3 border-t border-line px-4 py-3">
      {transaction.rawText && <p className="text-sm text-muted">{transaction.rawText}</p>}
      {(bank || transaction.accountLast4) && (
        <p className="text-sm text-muted">
          {[bank ? `알림 앱 ${bank}` : "", transaction.accountLast4 ? `통장 ${transaction.accountLast4}` : ""].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="사용처">
          <TextInput value={merchant} onChange={(event) => setMerchant(event.target.value)} />
        </Field>
        <Field label="카테고리">
          <SelectInput value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">미분류</option>
            {ledger.snap.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="통장">
          <SelectInput value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">자동</option>
            {ledger.snap.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          tone="ink"
          onClick={() =>
            void ledger.updateTransaction(transaction.id, {
              merchant: merchant.trim() || transaction.merchant,
              categoryId: categoryId || null,
              accountId: accountId || null,
            })
          }
        >
          수정 저장
        </Button>
        <Button tone="ghost" onClick={() => void ledger.updateTransaction(transaction.id, { excluded: !transaction.excluded })}>
          {transaction.excluded ? "통계에 포함" : "통계에서 빼기"}
        </Button>
        <Button tone="clay" onClick={() => void ledger.deleteTransaction(transaction.id)}>
          삭제
        </Button>
      </div>
    </div>
  );
}

function placeOf(transaction: Transaction, accounts: BankAccount[]): string {
  const account = resolveAccount(transaction, accounts);
  if (transaction.method === "credit" || transaction.method === "debit") {
    return transaction.instrument ?? account?.name ?? "";
  }
  if (account) return account.name;
  const bank = transactionBank(transaction);
  const tail = transaction.accountLast4 ? ` ${transaction.accountLast4}` : "";
  if (bank) return `${bank}${tail}`;
  return transaction.instrument ?? (transaction.accountLast4 ? `통장 ${transaction.accountLast4}` : "");
}

function seoulInputValue(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}
