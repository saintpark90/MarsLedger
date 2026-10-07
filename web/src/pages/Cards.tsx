import { useState } from "react";
import { useLedger } from "../context/LedgerContext";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";
import { accountLabel, mainAccount } from "../lib/accounts";
import { buildForecast } from "../lib/forecast";
import { parseAmountInput, seoulParts, won } from "../lib/format";
import type { CreditCard } from "../lib/types";

export function CardsPage() {
  const ledger = useLedger();
  const today = seoulParts();
  const forecast = buildForecast({
    today,
    balance: ledger.snap.settings.mainBalance,
    payday: ledger.snap.settings.payday,
    salaries: ledger.snap.salaries,
    recurring: ledger.snap.recurring,
    recurringMarks: ledger.snap.recurringMarks,
    cards: ledger.snap.cards,
    cardMarks: ledger.snap.cardMarks,
    transactions: ledger.snap.transactions,
  });
  const [name, setName] = useState("");
  const [paymentDay, setPaymentDay] = useState("14");
  const [paymentAccountId, setPaymentAccountId] = useState(mainAccount(ledger.snap).id);
  const selectedAccountId = ledger.snap.accounts.some((account) => account.id === paymentAccountId)
    ? paymentAccountId
    : mainAccount(ledger.snap).id;
  const orphans = unmatched(ledger.snap.transactions, ledger.snap.cards);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">신용카드</h2>
        <p className="text-sm text-muted">
          이번 달 청구액은 지난달 신용 사용 합계입니다. 카드마다 어느 통장에서 어느 날에 빠져나가는지 지정하면, 그 통장 예상 잔액에서만 빼니다.
        </p>
      </div>

      <section className="sheet grid gap-3 p-4 md:grid-cols-[1fr_120px_1fr_auto] md:items-end">
        <Field label="카드 이름">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="삼성카드" />
        </Field>
        <Field label="출금일">
          <TextInput inputMode="numeric" value={paymentDay} onChange={(event) => setPaymentDay(event.target.value)} />
        </Field>
        <Field label="출금 통장">
          <SelectInput value={selectedAccountId} onChange={(event) => setPaymentAccountId(event.target.value)}>
            {ledger.snap.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Button
          tone="ink"
          onClick={() => {
            const day = Number(paymentDay);
            if (!name.trim() || day < 1 || day > 31) return;
            void ledger.addCard(name, day, "#1a4f8b", selectedAccountId || null);
            setName("");
          }}
        >
          카드 추가
        </Button>
      </section>

      {orphans.length > 0 && (
        <section className="sheet p-4">
          <h3 className="font-medium">알림에만 있는 카드</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {orphans.map((instrument) => (
              <Button key={instrument} tone="ghost" onClick={() => void ledger.addCard(instrument, 14, "#1a4f8b", mainAccount(ledger.snap).id)}>
                {instrument} 등록
              </Button>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {ledger.snap.cards.length === 0 && <p className="text-sm text-muted">등록된 카드가 없습니다.</p>}
        {ledger.snap.cards.map((card) => {
          const line = forecast.cardLines.find((item) => item.id === card.id);
          return <CardBlock key={card.id} card={card} bill={line?.billAmount ?? 0} pending={line?.pending ?? false} usage={line?.usageThisMonth ?? 0} />;
        })}
      </div>
    </div>
  );
}

function CardBlock({ card, bill, pending, usage }: { card: CreditCard; bill: number; pending: boolean; usage: number }) {
  const ledger = useLedger();
  const today = seoulParts();
  const mark = ledger.snap.cardMarks.find((item) => item.cardId === card.id && item.year === today.year && item.month === today.month);
  const [paymentDay, setPaymentDay] = useState(String(card.paymentDay));
  const [paymentAccountId, setPaymentAccountId] = useState(card.paymentAccountId ?? "");
  const [override, setOverride] = useState(mark?.amount == null ? "" : String(mark.amount));
  const paymentAccount = ledger.snap.accounts.find((account) => account.id === (card.paymentAccountId ?? "")) ?? ledger.snap.accounts.find((account) => account.isMain);

  function saveMark(paid: boolean | null, amountText = override) {
    const amount = amountText.trim() ? parseAmountInput(amountText) : null;
    void ledger.setCardMark({ cardId: card.id, year: today.year, month: today.month, amount, paid });
  }

  return (
    <article className="sheet p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{card.name}</h3>
          <p className="text-sm text-muted">
            {paymentAccount ? `${accountLabel(paymentAccount)}에서 ` : ""}
            {card.paymentDay}일 출금 · {pending ? "이번 달 출금 예정" : "이번 달 출금은 반영된 것으로 계산"}
          </p>
        </div>
        <Button tone="clay" onClick={() => void ledger.deleteCard(card.id)}>
          삭제
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted">이번 달 청구액</p>
          <p className="tabular text-2xl font-semibold">{won(bill)}</p>
        </div>
        <div>
          <p className="text-sm text-muted">현재 이용금액</p>
          <p className="tabular text-2xl font-semibold">{won(usage)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Field label="출금일">
          <TextInput
            inputMode="numeric"
            value={paymentDay}
            onChange={(event) => setPaymentDay(event.target.value)}
            onBlur={() => {
              const day = Number(paymentDay);
              if (day >= 1 && day <= 31) void ledger.updateCard(card.id, { paymentDay: day });
            }}
          />
        </Field>
        <Field label="출금 통장">
          <SelectInput
            value={paymentAccountId}
            onChange={(event) => {
              const next = event.target.value;
              setPaymentAccountId(next);
              void ledger.updateCard(card.id, { paymentAccountId: next || null });
            }}
          >
            <option value="">메인 통장</option>
            {ledger.snap.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="청구액 직접 입력 (비우면 지난달 사용액)">
          <TextInput
            inputMode="numeric"
            value={override}
            onChange={(event) => setOverride(event.target.value)}
            onBlur={() => saveMark(mark?.paid ?? null)}
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone={mark?.paid == null ? "ink" : "ghost"} onClick={() => saveMark(null)}>
          날짜 기준
        </Button>
        <Button tone={mark?.paid === false ? "ink" : "ghost"} onClick={() => saveMark(false)}>
          아직 안 나감
        </Button>
        <Button tone={mark?.paid === true ? "ink" : "ghost"} onClick={() => saveMark(true)}>
          이미 나감
        </Button>
      </div>
    </article>
  );
}

function unmatched(
  transactions: { instrument: string | null; cardId: string | null; method: string }[],
  cards: CreditCard[],
): string[] {
  const names = new Set<string>();
  for (const transaction of transactions) {
    if (transaction.method !== "credit" || !transaction.instrument || transaction.cardId) continue;
    const matched = cards.some((card) => {
      const left = transaction.instrument!.replace(/\s+/g, "");
      const right = card.name.replace(/\s+/g, "");
      return left.includes(right) || right.includes(left);
    });
    if (!matched) names.add(transaction.instrument);
  }
  return [...names];
}
