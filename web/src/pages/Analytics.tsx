import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLedger } from "../context/LedgerContext";
import { categoryBreakdown, incomeOf, monthlyTrend, monthOptions, spendingOf, topMerchants } from "../lib/analytics";
import { inMonth, monthLabel, seoulParts, won } from "../lib/format";
import { SelectInput } from "../components/Ui";

export function AnalyticsPage() {
  const { snap } = useLedger();
  const today = seoulParts();
  const options = monthOptions(snap.transactions, today);
  const [selected, setSelected] = useState(`${today.year}-${today.month}`);
  const [year, month] = selected.split("-").map(Number);
  const rows = useMemo(() => categoryBreakdown(snap.transactions, snap.categories, year, month), [snap, year, month]);
  const trend = useMemo(() => monthlyTrend(snap.transactions, { year, month }), [snap.transactions, year, month]);
  const merchants = topMerchants(snap.transactions, year, month);
  const expense = snap.transactions.reduce((sum, transaction) => sum + (inMonth(transaction.occurredAt, year, month) ? spendingOf(transaction) : 0), 0);
  const income = snap.transactions.reduce((sum, transaction) => sum + (inMonth(transaction.occurredAt, year, month) ? incomeOf(transaction) : 0), 0);
  const top = rows[0];
  const insight = expense <= 0 || !top
    ? "이 달의 지출이 아직 없습니다."
    : `지출의 ${Math.round((top.amount / expense) * 100)}%가 ${top.name}입니다.${merchants[0] ? ` 가장 큰 사용처는 ${merchants[0].merchant}입니다.` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">소비 패턴</h2>
          <p className="text-sm text-muted">{insight}</p>
        </div>
        <SelectInput className="w-auto" value={selected} onChange={(event) => setSelected(event.target.value)}>
          {options.map((option) => (
            <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
              {monthLabel(option.year, option.month)}
            </option>
          ))}
        </SelectInput>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="지출" value={won(expense)} />
        <Stat label="수입" value={won(income)} />
        <Stat label="수입 − 지출" value={won(income - expense)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="sheet p-4">
          <h3 className="font-semibold">카테고리별 지출</h3>
          {rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">그래프에 표시할 지출이 없습니다.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} dataKey="amount" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>
                    {rows.map((row) => (
                      <Cell key={row.categoryId} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => won(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.categoryId} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                  {row.name}
                </span>
                <span className="tabular">
                  {won(row.amount)} · {expense ? Math.round((row.amount / expense) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sheet p-4">
          <h3 className="font-semibold">최근 6개월</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip formatter={(value, name) => [won(Number(value)), name === "expense" ? "지출" : "수입"]} />
                <Bar dataKey="income" fill="#1e6a45" radius={4} />
                <Bar dataKey="expense" fill="#b6402c" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h3 className="mt-2 font-semibold">큰 사용처</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {merchants.length === 0 && <li className="text-muted">사용처가 없습니다.</li>}
            {merchants.map((merchant) => (
              <li key={merchant.merchant} className="flex justify-between">
                <span>{merchant.merchant}</span>
                <span className="tabular">{won(merchant.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <section className="sheet p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
    </section>
  );
}
