import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { cardsPaidFrom, mainAccount, recurringForAccount, resolveAccount, transactionBank } from "../lib/accounts";
import { categoryBreakdown } from "../lib/analytics";
import { buildForecast, type Forecast } from "../lib/forecast";
import { formatKoreanDateTime, formatKoreanYmd, monthLabel, recurringDayText, seoulParts, won } from "../lib/format";
import { merchantLabel } from "../lib/parseNotification";
import { bySort } from "../lib/order";
import { AccountThumb, CardThumb, LedgerThumb } from "../components/Thumbs";
import { Button, Signed } from "../components/Ui";
import type { LedgerSnapshot } from "../lib/types";

export function Dashboard() {
  const ledger = useLedger();
  const today = seoulParts();
  const { snap } = ledger;
  const main = mainAccount(snap);
  const accounts = [...snap.accounts].sort((left, right) => Number(right.isMain) - Number(left.isMain));
  const rows = useMemo(
    () =>
      accounts.map((account) => ({
        account,
        forecast: buildForecast({
          today,
          balance: account.balance,
          payday: snap.settings.payday,
          salaries: snap.salaries,
          salaryAccountId: account.id,
          accounts: snap.accounts,
          recurring: bySort(recurringForAccount(snap.recurring, account, snap.accounts)),
          recurringMarks: snap.recurringMarks,
          cards: bySort(cardsPaidFrom(snap.cards, account)),
          cardMarks: snap.cardMarks,
          transactions: snap.transactions,
        }),
      })),
    [accounts, snap, today],
  );
  const expectedTotal = rows.reduce((sum, row) => sum + row.forecast.expectedBalance, 0);
  const breakdown = categoryBreakdown(snap.transactions, snap.categories, today.year, today.month);
  const max = breakdown[0]?.amount ?? 1;
  const recent = [...snap.transactions].sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)).slice(0, 5);
  const balanceHint = latestBalanceHint(snap);

  return (
    <div className="space-y-5">
      <section className="sheet border-l-8 border-l-spine p-5 md:p-7">
        <p className="text-sm text-muted">{monthLabel(today.year, today.month)} 정산 후 남는 돈</p>
        <p className="tabular mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{won(expectedTotal)}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          지금 통장 잔액에 아직 들어오지 않은 급여를 더하고, 이번 달에 빠지는 자동이체와 카드대금을 뺀 금액입니다. 출금일이 다음 달이어도 이미 쓴 카드값은 여기서 뺍니다.
        </p>
      </section>

      {rows.map(({ account, forecast }) => (
        <AccountForecast key={account.id} accountName={account.name} bankName={account.bankName} isMain={account.isMain} forecast={forecast} />
      ))}

      {balanceHint && snap.settings.syncBalance && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm">
          <p className="flex items-center gap-2">
            <AccountThumb name={main.name} bankName={main.bankName} size="sm" />
            <span>
              {main.name} 최근 알림 잔액은 <strong className="tabular">{won(balanceHint.amount)}</strong>입니다.
            </span>
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
                <div className="flex min-w-0 items-center gap-3">
                  <LedgerThumb transaction={transaction} accounts={snap.accounts} cards={snap.cards} />
                  <div>
                  <p className="truncate font-medium">{merchantLabel(transaction.merchant, snap.accounts.find((item) => item.id === transaction.accountId)?.name)}</p>
                  <p className="text-muted">
                    {formatKoreanDateTime(transaction.occurredAt)} · {category?.name ?? "미분류"}
                  </p>
                  </div>
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

function AccountForecast({
  accountName,
  bankName,
  isMain,
  forecast,
}: {
  accountName: string;
  bankName: string;
  isMain: boolean;
  forecast: Forecast;
}) {
  const spentAhead = forecast.cardLines.filter((card) => card.upcoming && card.usageThisMonth !== 0);
  const bills = forecast.cardLines.filter((card) => card.pending && card.billAmount !== 0);
  return (
    <section className="sheet p-5 md:p-7">
      <div className="flex items-start gap-3">
        <AccountThumb name={accountName} bankName={bankName} />
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-muted">
            {accountName}
            {isMain ? " · 메인" : ""}
          </h2>
          <p className="tabular mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{won(forecast.expectedBalance)}</p>
          <p className="mt-1 text-sm text-muted">이번 달 정산 후</p>
        </div>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <Line label="현재 잔액" value={forecast.balance} plain />
        {forecast.salaryLines
          .filter((line) => line.pending)
          .map((line) => (
            <Line
              key={line.id}
              label={`${line.title} · ${line.day}일 참고${line.fromDeposit ? " · 최근 입금" : line.usedPreviousMonth ? " · 지난달 금액" : ""}`}
              value={line.amount}
            />
          ))}
        {isMain && forecast.salaryLines.length === 0 && <p className="text-muted">급여 금액이 없습니다. 설정에서 급여일과 금액을 넣으면 여기에 더합니다.</p>}
        {forecast.recurringPending.map((item) => (
          <Line
            key={item.id}
            label={`${item.name} · ${recurringDayText(item.dayOfMonth)}${item.variable ? (item.fromPreviousMonth ? " · 지난달 금액" : item.amount === 0 ? " · 예상 금액 없음" : " · 이번 달 예상") : ""}`}
            value={-item.amount}
          />
        ))}
        {bills.map((card) => (
          <Line
            key={card.id}
            label={
              <span className="inline-flex items-center gap-2">
                <CardThumb name={card.name} color={card.color} size="sm" />
                {card.name} · {card.paymentMonth}월 {card.paymentDay}일 출금
              </span>
            }
            value={-card.billAmount}
          />
        ))}
        {spentAhead.map((card) => (
          <Line
            key={`${card.id}-open`}
            label={
              <span className="inline-flex items-center gap-2">
                <CardThumb name={card.name} color={card.color} size="sm" />
                {card.name} · {formatKoreanYmd(card.openPayment)} 출금
              </span>
            }
            value={-card.usageThisMonth}
          />
        ))}
        <div className="flex items-center justify-between border-t border-line pt-3 text-base font-semibold">
          <dt>남는 돈</dt>
          <dd className="tabular">{won(forecast.expectedBalance)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Line({ label, value, plain = false }: { label: React.ReactNode; value: number; plain?: boolean }) {
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
