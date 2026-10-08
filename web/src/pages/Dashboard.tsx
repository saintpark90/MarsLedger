import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { cardsPaidFrom, mainAccount, recurringForAccount, resolveAccount, transactionBank } from "../lib/accounts";
import { categoryBreakdown } from "../lib/analytics";
import { buildForecast } from "../lib/forecast";
import { formatKoreanDateTime, formatKoreanYmd, monthLabel, recurringDayText, seoulParts, won } from "../lib/format";
import { Button, Signed } from "../components/Ui";
import type { LedgerSnapshot, YMD } from "../lib/types";

export function Dashboard() {
  const ledger = useLedger();
  const today = seoulParts();
  const { snap } = ledger;
  const main = mainAccount(snap);
  const forecast = useMemo(
    () =>
      buildForecast({
        today,
        balance: main.balance,
        payday: snap.settings.payday,
        salaries: snap.salaries,
        recurring: recurringForAccount(snap.recurring, main, snap.accounts),
        recurringMarks: snap.recurringMarks,
        cards: cardsPaidFrom(snap.cards, main),
        cardMarks: snap.cardMarks,
        transactions: snap.transactions,
      }),
    [snap, today, main],
  );
  const allCards = useMemo(
    () =>
      buildForecast({
        today,
        balance: 0,
        payday: snap.settings.payday,
        salaries: [],
        recurring: [],
        recurringMarks: [],
        cards: snap.cards,
        cardMarks: snap.cardMarks,
        transactions: snap.transactions,
      }),
    [snap, today],
  );
  const breakdown = categoryBreakdown(snap.transactions, snap.categories, today.year, today.month);
  const spent = breakdown.reduce((sum, row) => sum + row.amount, 0);
  const allCardLines = allCards.cardLines;
  const usage = allCardLines.reduce((sum, card) => sum + card.usageThisMonth, 0);
  const max = breakdown[0]?.amount ?? 1;
  const recent = [...snap.transactions].sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)).slice(0, 5);
  const balanceHint = latestBalanceHint(snap);

  return (
    <div className="space-y-5">
      <section className="sheet border-l-8 border-l-spine p-5 md:p-7">
        <p className="text-sm text-muted">{monthLabel(today.year, today.month)} 정산 후 예상 잔액</p>
        <p className="tabular mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{won(forecast.expectedBalance)}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          {main.name}에서 이번 달에 빠지는 자동이체와 카드대금만 빼고, 들어오기 전인 급여를 더한 금액입니다. 다음 달에 빠지는 카드값은 아래에 출금일과 함께 표시합니다.
        </p>
      </section>

      <AccountBalances snap={snap} today={today} />

      {balanceHint && snap.settings.syncBalance && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm">
          <p>
            {main.name} 최근 알림 잔액은 <strong className="tabular">{won(balanceHint.amount)}</strong>입니다.
          </p>
          <Button
            tone="pine"
            onClick={() =>
              void ledger.saveSettings({
                ...snap.settings,
                mainBalance: balanceHint.amount,
                balanceAsOf: balanceHint.at,
              })
            }
          >
            이 잔액으로 맞추기
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="sheet p-5">
          <h2 className="text-lg font-semibold">예상 잔액 계산</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Line label={`현재 ${main.name}`} value={forecast.balance} plain />
            <Line label="남은 자동이체" value={-forecast.recurringPendingTotal} />
            <Line label="자동이체 후" value={forecast.afterTransfers} plain />
            <Line label="남은 카드대금" value={-forecast.cardPendingTotal} />
            <Line label="카드대금 후" value={forecast.afterCards} plain />
            <Line
              label={forecast.salaryUsedPreviousMonth ? "예정 급여 · 지난달 금액" : "예정 급여"}
              value={forecast.salaryPending ? forecast.salaryAmount : 0}
            />
            <div className="flex items-center justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>최종 예상</dt>
              <dd className="tabular">{won(forecast.expectedBalance)}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-1 text-sm text-muted">
            {forecast.recurringPending.map((item) => (
              <p key={item.id}>
                {item.name} · {recurringDayText(item.dayOfMonth)} · {won(item.amount)}
              </p>
            ))}
            {forecast.cardLines
              .filter((card) => card.pending && card.billAmount !== 0)
              .map((card) => (
                <p key={card.id}>
                  {card.name} 청구 · {card.paymentMonth}월 {card.paymentDay}일 · {won(card.billAmount)}
                </p>
              ))}
            {forecast.cardLines
              .filter((card) => card.upcoming && card.usageThisMonth !== 0)
              .map((card) => (
                <p key={`${card.id}-next`}>
                  {card.name} · {formatKoreanYmd(card.openStart)}~{formatKoreanYmd(card.openEnd)} · {formatKoreanYmd(card.openPayment)} 출금 · {won(card.usageThisMonth)}
                </p>
              ))}
            {!forecast.salaryKnown && <p>급여 금액이 없습니다. 설정에서 지난달 급여를 입력하면 예상에 포함됩니다.</p>}
            {forecast.salaryPending && forecast.salaryKnown && (
              <p>{forecast.salaryUsedPreviousMonth ? "이번 달 급여가 없어 지난달 금액으로 계산했습니다." : "이번 달 급여는 아직 들어오기 전으로 계산했습니다."}</p>
            )}
            {!forecast.salaryPending && <p>급여는 이미 통장 잔액에 포함된 것으로 계산했습니다.</p>}
          </div>
        </section>

        <div className="grid gap-5">
          <section className="sheet p-5">
            <p className="text-sm text-muted">현재 신용카드 사용액</p>
            <p className="tabular mt-1 text-3xl font-semibold">{won(usage)}</p>
            <p className="mt-1 text-sm text-muted">지금 이용기간에 쌓인 금액입니다. 출금일은 카드마다 다릅니다.</p>
            <div className="mt-3 space-y-1 text-sm text-muted">
              {allCardLines
                .filter((card) => card.usageThisMonth !== 0 || (card.pending && card.billAmount !== 0))
                .map((card) => (
                  <p key={card.id}>
                    {card.name} · {formatKoreanYmd(card.openStart)}~{formatKoreanYmd(card.openEnd)} · {formatKoreanYmd(card.openPayment)} 출금 · {won(card.usageThisMonth)}
                  </p>
                ))}
            </div>
            <Link to="/cards" className="mt-3 inline-block text-sm text-pine">
              카드 결제 관리
            </Link>
          </section>
          <section className="sheet p-5">
            <p className="text-sm text-muted">이번 달 지출</p>
            <p className="tabular mt-1 text-3xl font-semibold">{won(spent)}</p>
            <Link to="/analytics" className="mt-3 inline-block text-sm text-pine">
              소비 패턴 보기
            </Link>
          </section>
        </div>
      </div>

      <section className="sheet p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">이번 달 카테고리</h2>
          <Link to="/rules" className="text-sm text-pine">
            분류 규칙
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {breakdown.length === 0 && <p className="text-sm text-muted">아직 이번 달 지출이 없습니다.</p>}
          {breakdown.map((row) => (
            <div key={row.categoryId}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{row.name}</span>
                <span className="tabular">{won(row.amount)}</span>
              </div>
              <div className="h-2 rounded-full bg-line">
                <div className="h-2 rounded-full" style={{ width: `${Math.max(6, (row.amount / max) * 100)}%`, background: row.color }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sheet p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 내역</h2>
          <Link to="/transactions" className="text-sm text-pine">
            전체 보기
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {recent.length === 0 && <li className="py-4 text-sm text-muted">알림이 들어오거나 직접 입력하면 여기에 쌓입니다.</li>}
          {recent.map((transaction) => {
            const category = snap.categories.find((item) => item.id === transaction.categoryId);
            const signed = transaction.direction === "income" ? transaction.amount : transaction.direction === "refund" ? -transaction.amount : -transaction.amount;
            return (
              <li key={transaction.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{transaction.merchant}</p>
                  <p className="text-muted">
                    {formatKoreanDateTime(transaction.occurredAt)} · {category?.name ?? "미분류"}
                  </p>
                </div>
                <Signed value={signed} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function AccountBalances({ snap, today }: { snap: LedgerSnapshot; today: YMD }) {
  const rows = snap.accounts.map((account) => {
    const view = buildForecast({
      today,
      balance: account.balance,
      payday: account.isMain ? snap.settings.payday : 31,
      salaries: account.isMain ? snap.salaries : [],
      recurring: recurringForAccount(snap.recurring, account, snap.accounts),
      recurringMarks: snap.recurringMarks,
      cards: cardsPaidFrom(snap.cards, account),
      cardMarks: snap.cardMarks,
      transactions: snap.transactions,
    });
    return { account, expected: view.expectedBalance };
  });
  const total = rows.reduce((sum, row) => sum + row.account.balance, 0);
  const expectedTotal = rows.reduce((sum, row) => sum + row.expected, 0);

  return (
    <section className="sheet p-5 md:p-7">
      <h2 className="text-lg font-semibold">통장 잔액</h2>
      <ul className="mt-2 divide-y divide-line">
        {rows.map(({ account, expected }) => (
          <li key={account.id} className="flex items-end justify-between gap-4 py-4">
            <div>
              <p className="text-base font-medium">
                {account.name}
                {account.isMain ? " · 메인" : ""}
              </p>
              <p className="text-sm text-muted">정산 후 {won(expected)}</p>
            </div>
            <p className="tabular text-2xl font-semibold md:text-3xl">{won(account.balance)}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-end justify-between gap-4 border-t border-line pt-4">
        <div>
          <p className="text-base font-semibold">합계</p>
          <p className="text-sm text-muted">정산 후 {won(expectedTotal)}</p>
        </div>
        <p className="tabular text-3xl font-semibold">{won(total)}</p>
      </div>
    </section>
  );
}

function Line({ label, value, plain = false }: { label: string; value: number; plain?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>
        <Signed value={value} plain={plain} />
      </dd>
    </div>
  );
}

function latestBalanceHint(snap: LedgerSnapshot) {
  const main = mainAccount(snap);
  const found = [...snap.transactions]
    .filter((transaction) => transaction.balanceAfter != null)
    .filter((transaction) => {
      const account = resolveAccount(transaction, snap.accounts);
      if (account) return account.id === main.id;
      return !transactionBank(transaction);
    })
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))[0];
  if (!found || found.balanceAfter == null) return null;
  const newer = !main.balanceAsOf || +new Date(found.occurredAt) > +new Date(main.balanceAsOf);
  if (!newer || found.balanceAfter === main.balance) return null;
  return { amount: found.balanceAfter, at: found.occurredAt };
}
