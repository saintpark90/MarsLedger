import { useMemo, useState } from "react";
import { useLedger, type NewTransaction } from "../context/LedgerContext";
import { accountLabel, mainAccount, resolveAccount, transactionBank } from "../lib/accounts";
import { parseNotification } from "../lib/parseNotification";
import { formatKoreanDate, monthLabel, parseAmountInput, seoulDateKey, seoulParts, won } from "../lib/format";
import { planInstallment } from "../lib/installment";
import { monthOptions } from "../lib/analytics";
import type { BankAccount, CreditCard, Direction, PayMethod, Transaction } from "../lib/types";
import { StatementImport } from "../components/StatementImport";
import { AccountField, AccountThumb, CardThumb, LedgerThumb } from "../components/Thumbs";
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
          <p className="text-sm text-muted">휴대폰 알림, 직접 입력, 카드 명세서가 같은 장부에 모입니다.</p>
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

      <StatementImport
        onImported={(months) => {
          if (month === "all") return;
          const [year, monthNumber] = month.split("-").map(Number);
          const current = `${year}-${String(monthNumber).padStart(2, "0")}`;
          if (months.every((item) => item === current)) return;
          setMonth("all");
        }}
      />

      {[...groups.entries()].map(([day, rows]) => (
        <section key={day}>
          <h3 className="mb-2 text-sm text-muted">{formatKoreanDate(rows[0].occurredAt)}</h3>
          <ul className="sheet divide-y divide-line">
            {rows.map((transaction) => (
              <li key={transaction.id}>
                <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpenId(openId === transaction.id ? null : transaction.id)}>
                  <span className="flex min-w-0 items-center gap-3">
                    <LedgerThumb transaction={transaction} accounts={ledger.snap.accounts} cards={ledger.snap.cards} />
                    <span className="min-w-0">
                    <span className="block font-medium">{transaction.merchant}</span>
                    <span className="text-sm text-muted">
                      {ledger.snap.categories.find((category) => category.id === transaction.categoryId)?.name ?? "미분류"}
                      {" · "}
                      {sourceLabel(transaction, ledger.snap.accounts, ledger.snap.cards)}
                      {installmentLabel(transaction) ? ` · ${installmentLabel(transaction)}` : ""}
                    </span>
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
  const [source, setSource] = useState("");
  const [months, setMonths] = useState("1");
  const [when, setWhen] = useState(seoulInputValue(new Date()));
  const picked = sourceOf(source, ledger.snap.cards, ledger.snap.accounts);
  const card = picked?.kind === "card" ? picked.card : null;
  const total = parseAmountInput(amount);
  const occurredAt = new Date(`${when}:00+09:00`).toISOString();
  const installmentMonths = card && direction === "expense" ? Number(months) : 1;
  const plan = card && installmentMonths >= 2 ? planInstallment(card, occurredAt, total, installmentMonths) : null;
  const invalidPlan = Boolean(card && direction === "expense" && installmentMonths >= 2 && total > 0 && !plan);

  async function save() {
    if (!picked || total <= 0 || invalidPlan) return;
    const name = merchant.trim() || "직접 입력";
    if (plan && card) {
      const labels = plan.map((slice) => `${slice.statement.month}월`).join(", ");
      const saved = await ledger.importTransactions(
        plan.map((slice) => ({
          amount: slice.amount,
          merchant: name,
          rawText: `할부 ${slice.round}/${slice.months}\n이용금액 ${total.toLocaleString("ko-KR")}원`,
          direction,
          method: "credit" as const,
          instrument: card.name,
          cardId: card.id,
          source: "manual" as const,
          occurredAt: slice.occurredAt,
        })),
        `${plan.length}개월 할부를 ${labels} 명세서에 나눴습니다.`,
      );
      if (saved) onClose();
      return;
    }
    const saved = await ledger.addTransaction({
      amount: total,
      merchant: name,
      direction,
      source: "manual",
      occurredAt,
      ...pickedFields(picked),
    });
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
      <Field label="소비수단">
        <div className="flex items-center gap-2">
          {picked?.kind === "card" && <CardThumb name={picked.card.name} color={picked.card.color} size="sm" />}
          {picked?.kind === "account" && <AccountThumb name={picked.account.name} bankName={picked.account.bankName} size="sm" />}
          <SelectInput className="min-w-0 flex-1" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">카드 또는 계좌 선택</option>
            {ledger.snap.cards.length > 0 && (
              <optgroup label="카드">
                {ledger.snap.cards.map((item) => (
                  <option key={item.id} value={`card:${item.id}`}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            )}
            {ledger.snap.accounts.length > 0 && (
              <optgroup label="계좌">
                {ledger.snap.accounts.map((item) => (
                  <option key={item.id} value={`account:${item.id}`}>
                    {accountLabel(item)}
                  </option>
                ))}
              </optgroup>
            )}
          </SelectInput>
        </div>
      </Field>
      <Field label="시각">
        <TextInput type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
      </Field>
      {card && direction === "expense" && (
        <Field label="할부">
          <SelectInput value={months} onChange={(event) => setMonths(event.target.value)}>
            <option value="1">일시불</option>
            {Array.from({ length: 35 }, (_, index) => index + 2).map((count) => (
              <option key={count} value={count}>
                {count}개월
              </option>
            ))}
          </SelectInput>
        </Field>
      )}
      {plan && (
        <p className="text-sm text-muted md:col-span-2">
          {plan.map((slice) => `${slice.statement.month}월`).join(", ")} 명세서에 {plan.map((slice) => won(slice.amount)).join(", ")}으로 나뉩니다.
        </p>
      )}
      {invalidPlan && <p className="text-sm text-clay md:col-span-2">할부 개월 수는 금액(원)보다 클 수 없습니다.</p>}
      <div className="flex items-end">
        <Button tone="pine" disabled={!picked || total <= 0 || Boolean(invalidPlan)} onClick={() => void save()}>
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
  const [source, setSource] = useState(initialSource(transaction));
  const bank = transactionBank(transaction);
  return (
    <div className="space-y-3 border-t border-line px-4 py-3">
      {transaction.rawText && <p className="text-sm text-muted">{transaction.rawText}</p>}
      {(bank || transaction.accountLast4 || transaction.instrument) && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <LedgerThumb transaction={transaction} accounts={ledger.snap.accounts} cards={ledger.snap.cards} />
          <span>
            {[
              transaction.instrument && (transaction.method === "credit" || transaction.method === "debit") ? transaction.instrument : "",
              bank ? `알림 앱 ${bank}` : "",
              transaction.accountLast4 ? `통장 ${transaction.accountLast4}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
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
        <Field label="소비수단">
          <SelectInput value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">그대로</option>
            {ledger.snap.cards.map((item) => (
              <option key={item.id} value={`card:${item.id}`}>
                {item.name}
              </option>
            ))}
            {ledger.snap.accounts.map((item) => (
              <option key={item.id} value={`account:${item.id}`}>
                {accountLabel(item)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="통장">
          <AccountField accounts={ledger.snap.accounts} accountId={accountId || resolveAccount(transaction, ledger.snap.accounts)?.id || ""}>
            <SelectInput value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">자동</option>
              {ledger.snap.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </SelectInput>
          </AccountField>
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
              ...sourcePatch(source, ledger.snap.cards, ledger.snap.accounts),
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

function sourceLabel(transaction: Transaction, accounts: BankAccount[], cards: CreditCard[]): string {
  const card = cards.find((item) => item.id === transaction.cardId);
  if (card) return card.name;
  const place = placeOf(transaction, accounts);
  if (place) return place;
  return methods.find((method) => method.value === transaction.method)?.label ?? "";
}

function installmentLabel(transaction: Transaction): string {
  const match = transaction.rawText?.match(/할부\s*(\d+\s*\/\s*\d+)/);
  return match ? `할부 ${match[1].replace(/\s+/g, "")}` : "";
}

type SpendSource = { kind: "card"; card: CreditCard } | { kind: "account"; account: BankAccount };

function sourceOf(value: string, cards: CreditCard[], accounts: BankAccount[]): SpendSource | null {
  if (value.startsWith("card:")) {
    const card = cards.find((item) => item.id === value.slice(5));
    return card ? { kind: "card", card } : null;
  }
  if (value.startsWith("account:")) {
    const account = accounts.find((item) => item.id === value.slice(8));
    return account ? { kind: "account", account } : null;
  }
  return null;
}

function pickedFields(source: SpendSource): Pick<NewTransaction, "method" | "instrument" | "cardId" | "accountId"> {
  if (source.kind === "card") {
    return { method: "credit", instrument: source.card.name, cardId: source.card.id, accountId: null };
  }
  return { method: "transfer", instrument: source.account.name, cardId: null, accountId: source.account.id };
}

function initialSource(transaction: Transaction): string {
  if (transaction.cardId) return `card:${transaction.cardId}`;
  if (transaction.accountId) return `account:${transaction.accountId}`;
  return "";
}

function sourcePatch(value: string, cards: CreditCard[], accounts: BankAccount[]): Partial<Transaction> {
  const picked = sourceOf(value, cards, accounts);
  if (!picked) return {};
  return pickedFields(picked);
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
