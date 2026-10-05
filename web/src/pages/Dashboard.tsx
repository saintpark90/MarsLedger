import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { categoryBreakdown } from "../lib/analytics";
import { buildForecast } from "../lib/forecast";
import { formatKoreanDateTime, monthLabel, seoulParts, won } from "../lib/format";
import { Button, Signed } from "../components/Ui";

export function Dashboard() {
  const ledger = useLedger();
  const today = seoulParts();
  const { snap } = ledger;
  const forecast = useMemo(
    () =>
      buildForecast({
        today,
        balance: snap.settings.mainBalance,
        payday: snap.settings.payday,
        salaries: snap.salaries,
        recurring: snap.recurring,
        recurringMarks: snap.recurringMarks,
        cards: snap.cards,
        cardMarks: snap.cardMarks,
        transactions: snap.transactions,
      }),
    [snap, today],
  );
  const breakdown = categoryBreakdown(snap.transactions, snap.categories, today.year, today.month);
  const spent = breakdown.reduce((sum, row) => sum + row.amount, 0);
  const usage = forecast.cardLines.reduce((sum, card) => sum + card.usageThisMonth, 0);
  const max = breakdown[0]?.amount ?? 1;
  const recent = [...snap.transactions].sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)).slice(0, 5);
  const balanceHint = latestBalanceHint(snap);

  return (
    <div className="space-y-5">
      <section className="sheet border-l-8 border-l-spine p-5 md:p-7">
        <p className="text-sm text-muted">{monthLabel(today.year, today.month)} 정산 후 예상 잔액</p>
        <p className="tabular mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{won(forecast.expectedBalance)}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          메인 통장에서 아직 빠지지 않은 자동이체와 이번 달 카드대금을 빼고, 들어오기 전인 급여를 더한 금액입니다.
        </p>
      </section>

      {balanceHint && snap.settings.syncBalance && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm">
          <p>
            최근 알림 잔액은 <strong className="tabular">{won(balanceHint.amount)}</strong>입니다.
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
            <Line label="현재 메인 통장" value={forecast.balance} plain />
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
                {item.name} · {item.dayOfMonth}일 · {won(item.amount)}
              </p>
            ))}
            {forecast.cardLines
              .filter((card) => card.pending)
              .map((card) => (
                <p key={card.id}>
                  {card.name} 청구 · {card.paymentDay}일 · {won(card.billAmount)}
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
            <p className="mt-1 text-sm text-muted">이번 달 승인분입니다. 다음 결제 대금의 기준이 됩니다.</p>
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

function latestBalanceHint(snap: { settings: { mainBalance: number; balanceAsOf: string | null }; transactions: { balanceAfter: number | null; occurredAt: string }[] }) {
  const found = [...snap.transactions]
    .filter((transaction) => transaction.balanceAfter != null)
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))[0];
  if (!found || found.balanceAfter == null) return null;
  const newer = !snap.settings.balanceAsOf || +new Date(found.occurredAt) > +new Date(snap.settings.balanceAsOf);
  if (!newer || found.balanceAfter === snap.settings.mainBalance) return null;
  return { amount: found.balanceAfter, at: found.occurredAt };
}
