import { useEffect, useState } from "react";
import { useLedger } from "../context/LedgerContext";
import { SortableList } from "../components/Sortable";
import { AccountField, AccountThumb, CardThumb } from "../components/Thumbs";
import { bySort } from "../lib/order";
import { Button, Field, SelectInput, TextInput } from "../components/Ui";
import { accountLabel, mainAccount } from "../lib/accounts";
import { MONTH_OFFSETS, cycleForDate, cycleOrderValid, defaultCardCycle, offsetLabel, usageRows } from "../lib/cardCycle";
import { buildForecast } from "../lib/forecast";
import { formatKoreanYmd, parseAmountInput, seoulDateKey, seoulParts, won } from "../lib/format";
import { shortMerchant } from "../lib/parseNotification";
import type { CreditCard, Transaction, YMD } from "../lib/types";

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
            <div className="flex items-center gap-2">
              {name.trim() && <CardThumb name={name} size="sm" />}
              <TextInput className="min-w-0 flex-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="현대카드" />
            </div>
          </Field>
          <Field label="출금 통장">
            <AccountField accounts={ledger.snap.accounts} accountId={selectedAccountId}>
            <SelectInput value={selectedAccountId} onChange={(event) => setPaymentAccountId(event.target.value)}>
              {ledger.snap.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </SelectInput>
            </AccountField>
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
                className="gap-2"
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
                <CardThumb name={instrument} size="sm" />
                {instrument} 등록
              </Button>
            ))}
          </div>
        </section>
      )}

      {ledger.snap.cards.length === 0 && <p className="text-sm text-muted">등록된 카드가 없습니다.</p>}
      <SortableList items={bySort(ledger.snap.cards)} onReorder={(ids) => void ledger.reorderCards(ids)}>
        {(card) => {
          const line = forecast.cardLines.find((item) => item.id === card.id);
          return <CardBlock card={card} line={line} />;
        }}
      </SortableList>
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
  const [usageOpen, setUsageOpen] = useState(false);
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
        <div className="flex items-start gap-3">
          <CardThumb name={card.name} color={card.color} />
          <div>
          <h3 className="text-lg font-semibold">{card.name}</h3>
          <p className="text-sm text-muted">
            {paymentAccount ? (
              <span className="mr-1 inline-flex items-center gap-1.5 align-middle">
                <AccountThumb name={paymentAccount.name} bankName={paymentAccount.bankName} size="sm" />
                {accountLabel(paymentAccount)} ·
              </span>
            ) : null}
            {offsetLabel(card.periodStartOffset)} {card.periodStartDay}일 ~ {offsetLabel(card.periodEndOffset)} {card.periodEndDay}일 사용 · {offsetLabel(card.paymentOffset)} {card.paymentDay}일 출금
          </p>
          <p className="mt-1 text-sm">{cycleSentence(card, today)}</p>
          </div>
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
          <button
            type="button"
            className="tabular text-2xl font-semibold underline decoration-line underline-offset-4 hover:text-pine disabled:no-underline disabled:hover:text-ink"
            disabled={!line}
            onClick={() => setUsageOpen(true)}
          >
            {won(line?.usageThisMonth ?? 0)}
          </button>
          <p className="text-sm text-muted">{line ? `${formatKoreanYmd(line.openPayment)} 출금` : ""}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <CycleFields {...cycle} onChange={setCycle} />
        <p className="text-sm text-muted">{cycleSentence(edited, today)}</p>
        {!editedValid && <p className="text-sm text-clay">이용 끝은 시작 이후이고, 출금일은 이용기간이 끝난 뒤여야 합니다.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="출금 통장">
            <AccountField accounts={ledger.snap.accounts} accountId={paymentAccountId || mainAccount(ledger.snap).id}>
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
            </AccountField>
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
      {usageOpen && line && (
        <UsageSheet
          card={card}
          start={line.openStart}
          end={line.openEnd}
          payment={line.openPayment}
          onClose={() => setUsageOpen(false)}
        />
      )}
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

function UsageSheet({
  card,
  start,
  end,
  payment,
  onClose,
}: {
  card: CreditCard;
  start: YMD;
  end: YMD;
  payment: YMD;
  onClose: () => void;
}) {
  const ledger = useLedger();
  const rows = usageRows(card, ledger.snap.transactions, start, end);
  const showInstallment = rows.some((row) => installmentOf(row));
  const total = rows.reduce((sum, row) => sum + signedAmount(row), 0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`usage-sheet-${card.id}`}
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-sheet shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 id={`usage-sheet-${card.id}`} className="flex items-center gap-2 text-lg font-semibold">
              <CardThumb name={card.name} color={card.color} size="sm" />
              {card.name}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {formatKoreanYmd(start)}~{formatKoreanYmd(end)} · {rows.length}건 · {formatKoreanYmd(payment)} 출금
            </p>
          </div>
          <Button tone="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">이 기간에 합산된 사용 내역이 없습니다.</p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[#f2f2f2] text-left">
                <tr>
                  <th className="border border-line px-2 py-1.5 font-medium">날짜</th>
                  <th className="border border-line px-2 py-1.5 font-medium">사용처</th>
                  <th className="border border-line px-2 py-1.5 font-medium">구분</th>
                  <th className="border border-line px-2 py-1.5 font-medium">카테고리</th>
                  {showInstallment && <th className="border border-line px-2 py-1.5 font-medium">할부</th>}
                  <th className="border border-line px-2 py-1.5 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const amount = signedAmount(row);
                  const category = ledger.snap.categories.find((item) => item.id === row.categoryId);
                  return (
                    <tr key={row.id} className="odd:bg-white">
                      <td className="border border-line px-2 py-1.5 tabular whitespace-nowrap">{seoulDateKey(row.occurredAt)}</td>
                      <td className="border border-line px-2 py-1.5">{shortMerchant(row.merchant)}</td>
                      <td className="border border-line px-2 py-1.5 whitespace-nowrap">{row.direction === "refund" ? "취소" : "지출"}</td>
                      <td className="border border-line px-2 py-1.5 whitespace-nowrap">
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: category?.color ?? "#6f685e" }} />
                        {category?.name ?? "미분류"}
                      </td>
                      {showInstallment && <td className="border border-line px-2 py-1.5 tabular">{installmentOf(row)}</td>}
                      <td className={`border border-line px-2 py-1.5 text-right tabular ${amount < 0 ? "text-pine" : ""}`}>{won(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#f7f4ee] font-semibold">
                  <td className="border border-line px-2 py-1.5" colSpan={showInstallment ? 5 : 4}>
                    합계
                  </td>
                  <td className="border border-line px-2 py-1.5 text-right tabular">{won(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function signedAmount(row: Transaction): number {
  return row.direction === "refund" ? -row.amount : row.amount;
}

function installmentOf(row: Transaction): string {
  const match = row.rawText?.match(/할부\s*(\d+\s*\/\s*\d+)/);
  return match ? match[1].replace(/\s+/g, "") : "";
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
