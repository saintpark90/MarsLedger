import { useState } from "react";
import { useLedger } from "../context/LedgerContext";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";
import { accountLabel, mainAccount } from "../lib/accounts";
import { MONTH_OFFSETS, cycleForDate, cycleOrderValid, defaultCardCycle, offsetLabel } from "../lib/cardCycle";
import { buildForecast } from "../lib/forecast";
import { formatKoreanYmd, parseAmountInput, seoulParts, won } from "../lib/format";
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
  const [paymentAccountId, setPaymentAccountId] = useState(mainAccount(ledger.snap).id);
  const [cycle, setCycle] = useState(defaultCardCycle);
  const [paymentDay, setPaymentDay] = useState("14");
  const selectedAccountId = ledger.snap.accounts.some((account) => account.id === paymentAccountId)
    ? paymentAccountId
    : mainAccount(ledger.snap).id;
  const draft = draftCard(name || "카드", Number(paymentDay) || 1, cycle);
  const draftValid = cycleOrderValid(draft) && Number(paymentDay) >= 1 && Number(paymentDay) <= 31;
  const orphans = unmatched(ledger.snap.transactions, ledger.snap.cards);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">신용카드</h2>
        <p className="text-sm text-muted">
          이용기간은 매달 반복됩니다. 당월 29일부터 익월 28일까지 쓴 금액이 +2월 10일에 빠지게 두면, 오늘 쓴 금액은 그 구간의 출금일에만 예상 잔액에서 빠집니다.
        </p>
      </div>

      <section className="sheet space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="카드 이름">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="현대카드" />
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
        </div>
        <CycleFields
          startOffset={cycle.periodStartOffset}
          startDay={cycle.periodStartDay}
          endOffset={cycle.periodEndOffset}
          endDay={cycle.periodEndDay}
          paymentOffset={cycle.paymentOffset}
          paymentDay={Number(paymentDay) || 1}
          onChange={(next) => {
            setCycle({
              periodStartOffset: next.startOffset,
              periodStartDay: next.startDay,
              periodEndOffset: next.endOffset,
              periodEndDay: next.endDay,
              paymentOffset: next.paymentOffset,
            });
            setPaymentDay(String(next.paymentDay));
          }}
        />
        <p className="text-sm text-muted">{cycleSentence(draft, today)}</p>
        {!draftValid && <p className="text-sm text-clay">이용 끝은 시작 이후이고, 출금일은 이용기간이 끝난 뒤여야 합니다.</p>}
        <Button
          tone="ink"
          disabled={!draftValid}
          onClick={() => {
            const day = Number(paymentDay);
            if (!name.trim() || !draftValid) return;
            void ledger.addCard({
              name,
              paymentDay: day,
              color: "#1a4f8b",
              paymentAccountId: selectedAccountId || null,
              ...cycle,
            });
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
              <Button
                key={instrument}
                tone="ghost"
                onClick={() =>
                  void ledger.addCard({
                    name: instrument,
                    paymentDay: 14,
                    color: "#1a4f8b",
                    paymentAccountId: mainAccount(ledger.snap).id,
                    ...defaultCardCycle,
                  })
                }
              >
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
          return <CardBlock key={card.id} card={card} line={line} />;
        })}
      </div>
    </div>
  );
}

function CardBlock({
  card,
  line,
}: {
  card: CreditCard;
  line?: {
    billAmount: number;
    pending: boolean;
    usageThisMonth: number;
    openStart: { year: number; month: number; day: number };
    openEnd: { year: number; month: number; day: number };
    openPayment: { year: number; month: number; day: number };
    paymentMonth: number;
    paymentDay: number;
  };
}) {
  const ledger = useLedger();
  const today = seoulParts();
  const mark = ledger.snap.cardMarks.find((item) => item.cardId === card.id && item.year === today.year && item.month === today.month);
  const [paymentAccountId, setPaymentAccountId] = useState(card.paymentAccountId ?? "");
  const [override, setOverride] = useState(mark?.amount == null ? "" : String(mark.amount));
  const [cycle, setCycle] = useState(cycleState(card));
  const paymentAccount = ledger.snap.accounts.find((account) => account.id === (card.paymentAccountId ?? "")) ?? ledger.snap.accounts.find((account) => account.isMain);
  const edited = draftCard(card.name, cycle.paymentDay, {
    periodStartOffset: cycle.startOffset,
    periodStartDay: cycle.startDay,
    periodEndOffset: cycle.endOffset,
    periodEndDay: cycle.endDay,
    paymentOffset: cycle.paymentOffset,
  });
  const editedValid = cycleOrderValid(edited);

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
            {paymentAccount ? `${accountLabel(paymentAccount)} · ` : ""}
            {offsetLabel(card.periodStartOffset)} {card.periodStartDay}일 ~ {offsetLabel(card.periodEndOffset)} {card.periodEndDay}일 사용 · {offsetLabel(card.paymentOffset)} {card.paymentDay}일 출금
          </p>
          <p className="mt-1 text-sm">{cycleSentence(card, today)}</p>
        </div>
        <Button tone="clay" onClick={() => void ledger.deleteCard(card.id)}>
          삭제
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted">
            이번 달 청구액{line ? ` · ${line.paymentMonth}월 ${line.paymentDay}일` : ""}
          </p>
          <p className="tabular text-2xl font-semibold">{won(line?.billAmount ?? 0)}</p>
          <p className="text-sm text-muted">{line?.pending ? "이번 달 출금 예정" : "이번 달 출금은 반영된 것으로 계산"}</p>
        </div>
        <div>
          <p className="text-sm text-muted">
            현재 이용금액
            {line ? ` · ${formatKoreanYmd(line.openStart)}~${formatKoreanYmd(line.openEnd)}` : ""}
          </p>
          <p className="tabular text-2xl font-semibold">{won(line?.usageThisMonth ?? 0)}</p>
          <p className="text-sm text-muted">{line ? `${formatKoreanYmd(line.openPayment)} 출금` : ""}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <CycleFields {...cycle} onChange={setCycle} />
        <p className="text-sm text-muted">{cycleSentence(edited, today)}</p>
        {!editedValid && <p className="text-sm text-clay">이용 끝은 시작 이후이고, 출금일은 이용기간이 끝난 뒤여야 합니다.</p>}
        <div className="grid gap-3 md:grid-cols-2">
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
          <Field label="이번 달 청구액 직접 입력 (비우면 이용기간 합계)">
            <TextInput
              inputMode="numeric"
              value={override}
              onChange={(event) => setOverride(event.target.value)}
              onBlur={() => saveMark(mark?.paid ?? null)}
            />
          </Field>
        </div>
        <Button
          tone="ink"
          disabled={!editedValid}
          onClick={() =>
            void ledger.updateCard(card.id, {
              periodStartOffset: cycle.startOffset,
              periodStartDay: cycle.startDay,
              periodEndOffset: cycle.endOffset,
              periodEndDay: cycle.endDay,
              paymentOffset: cycle.paymentOffset,
              paymentDay: cycle.paymentDay,
            })
          }
        >
          이용기간 저장
        </Button>
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

function CycleFields({
  startOffset,
  startDay,
  endOffset,
  endDay,
  paymentOffset,
  paymentDay,
  onChange,
}: {
  startOffset: number;
  startDay: number;
  endOffset: number;
  endDay: number;
  paymentOffset: number;
  paymentDay: number;
  onChange: (next: {
    startOffset: number;
    startDay: number;
    endOffset: number;
    endDay: number;
    paymentOffset: number;
    paymentDay: number;
  }) => void;
}) {
  const current = { startOffset, startDay, endOffset, endDay, paymentOffset, paymentDay };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <DayOffset label="이용 시작" offset={startOffset} day={startDay} onOffset={(value) => onChange({ ...current, startOffset: value })} onDay={(value) => onChange({ ...current, startDay: value })} />
      <DayOffset label="이용 끝" offset={endOffset} day={endDay} onOffset={(value) => onChange({ ...current, endOffset: value })} onDay={(value) => onChange({ ...current, endDay: value })} />
      <DayOffset label="출금" offset={paymentOffset} day={paymentDay} onOffset={(value) => onChange({ ...current, paymentOffset: value })} onDay={(value) => onChange({ ...current, paymentDay: value })} />
    </div>
  );
}

function DayOffset({
  label,
  offset,
  day,
  onOffset,
  onDay,
}: {
  label: string;
  offset: number;
  day: number;
  onOffset: (value: number) => void;
  onDay: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <SelectInput value={String(offset)} onChange={(event) => onOffset(Number(event.target.value))}>
          {MONTH_OFFSETS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectInput>
        <TextInput
          inputMode="numeric"
          value={String(day)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (event.target.value === "") onDay(1);
            else if (next >= 1 && next <= 31) onDay(next);
          }}
        />
      </div>
    </Field>
  );
}

function cycleState(card: CreditCard) {
  return {
    startOffset: card.periodStartOffset,
    startDay: card.periodStartDay,
    endOffset: card.periodEndOffset,
    endDay: card.periodEndDay,
    paymentOffset: card.paymentOffset,
    paymentDay: card.paymentDay,
  };
}

function draftCard(
  name: string,
  paymentDay: number,
  cycle: {
    periodStartOffset: number;
    periodStartDay: number;
    periodEndOffset: number;
    periodEndDay: number;
    paymentOffset: number;
  },
): CreditCard {
  return {
    id: "draft",
    name,
    color: "#1a4f8b",
    paymentAccountId: null,
    paymentDay,
    ...cycle,
  };
}

function cycleSentence(card: CreditCard, today: { year: number; month: number; day: number }): string {
  const open = cycleForDate(card, today);
  if (!open || !cycleOrderValid(card)) return "이용기간을 다시 확인해 주세요.";
  const year = open.payment.year === today.year ? "" : `${open.payment.year}년 `;
  return `오늘 사용분은 ${formatKoreanYmd(open.start)}~${formatKoreanYmd(open.end)}에 해당하고, ${year}${formatKoreanYmd(open.payment)}에 출금됩니다.`;
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
