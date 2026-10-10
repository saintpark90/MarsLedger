import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compareColumn, SortHeader, useColumnSort } from "../components/ColumnSort";
import { Button, SelectInput } from "../components/Ui";
import { useLedger } from "../context/LedgerContext";
import { categoryBreakdown, incomeOf, monthlyTrend, monthOptions, spendingOf, topMerchants } from "../lib/analytics";
import { formatSeoulTime, inMonth, monthLabel, seoulDateKey, seoulParts, won } from "../lib/format";
import { merchantLabel } from "../lib/parseNotification";
import type { Transaction } from "../lib/types";

type Detail = {
  title: string;
  color?: string;
  year: number;
  month: number;
  kind: "spending" | "income";
  categoryId?: string;
};

export function AnalyticsPage() {
  const { snap } = useLedger();
  const today = seoulParts();
  const options = monthOptions(snap.transactions, today);
  const [selected, setSelected] = useState(`${today.year}-${today.month}`);
  const [year, month] = selected.split("-").map(Number);
  const [detail, setDetail] = useState<Detail | null>(null);
  const rows = useMemo(() => categoryBreakdown(snap.transactions, snap.categories, year, month), [snap, year, month]);
  const trend = useMemo(() => monthlyTrend(snap.transactions, { year, month }), [snap.transactions, year, month]);
  const merchants = topMerchants(snap.transactions, year, month);
  const expense = snap.transactions.reduce((sum, transaction) => sum + (inMonth(transaction.occurredAt, year, month) ? spendingOf(transaction) : 0), 0);
  const income = snap.transactions.reduce((sum, transaction) => sum + (inMonth(transaction.occurredAt, year, month) ? incomeOf(transaction) : 0), 0);
  const top = rows[0];
  const insight = expense <= 0 || !top
    ? "이 달의 지출이 아직 없습니다."
    : `지출의 ${Math.round((top.amount / expense) * 100)}%가 ${top.name}입니다.${merchants[0] ? ` 가장 큰 사용처는 ${merchants[0].merchant}입니다.` : ""}`;

  function openSpending(categoryId?: string, title = "지출", color?: string, when = { year, month }) {
    setDetail({ title, color, year: when.year, month: when.month, kind: "spending", categoryId });
  }

  function openIncome(when = { year, month }) {
    setDetail({ title: "수입", year: when.year, month: when.month, kind: "income" });
  }

  function openBar(data: { payload?: { key?: string } }, kind: "spending" | "income") {
    const key = data.payload?.key;
    if (!key) return;
    const [barYear, barMonth] = key.split("-").map(Number);
    if (kind === "income") openIncome({ year: barYear, month: barMonth });
    else openSpending(undefined, "지출", undefined, { year: barYear, month: barMonth });
  }

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
        <Stat label="지출" value={won(expense)} onClick={() => openSpending()} />
        <Stat label="수입" value={won(income)} onClick={() => openIncome()} />
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
                  <Pie
                    data={rows}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={96}
                    paddingAngle={2}
                    cursor="pointer"
                    onClick={(_, index) => {
                      const row = rows[index];
                      if (row) openSpending(row.categoryId, row.name, row.color);
                    }}
                  >
                    {rows.map((row) => (
                      <Cell key={row.categoryId} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => won(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.categoryId}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-paper"
                  onClick={() => openSpending(row.categoryId, row.name, row.color)}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                    {row.name}
                  </span>
                  <span className="tabular">
                    {won(row.amount)} · {expense ? Math.round((row.amount / expense) * 100) : 0}%
                  </span>
                </button>
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
                <Bar dataKey="income" fill="#1e6a45" radius={4} cursor="pointer" onClick={(data) => openBar(data, "income")} />
                <Bar dataKey="expense" fill="#b6402c" radius={4} cursor="pointer" onClick={(data) => openBar(data, "spending")} />
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

      {detail && <PatternSheet detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Stat({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const className = "sheet p-4 text-left";
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
    </>
  );
  if (!onClick) return <section className={className}>{body}</section>;
  return (
    <button type="button" className={`${className} cursor-pointer hover:bg-paper`} onClick={onClick}>
      {body}
    </button>
  );
}

function PatternSheet({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const ledger = useLedger();
  const rows = ledger.snap.transactions.filter((transaction) => matches(transaction, detail));
  const showInstallment = rows.some((row) => installmentOf(row));
  const total = rows.reduce((sum, row) => sum + signed(row, detail), 0);
  const sort = useColumnSort<UsageColumn>("date", "desc");
  const sorted = useMemo(() => {
    const categories = ledger.snap.categories;
    const accounts = ledger.snap.accounts;
    return [...rows].sort((left, right) =>
      compareColumn(patternValue(left, sort.key, detail, categories, accounts), patternValue(right, sort.key, detail, categories, accounts), sort.direction),
    );
  }, [detail, ledger.snap.accounts, ledger.snap.categories, rows, sort.direction, sort.key]);

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
        aria-labelledby="pattern-sheet"
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-sheet shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 id="pattern-sheet" className="flex items-center gap-2 text-lg font-semibold">
              {detail.color && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: detail.color }} />}
              {detail.title}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {monthLabel(detail.year, detail.month)} · {rows.length}건
            </p>
          </div>
          <Button tone="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">이 기간에 해당하는 내역이 없습니다.</p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[#f2f2f2] text-left">
                <tr>
                  <SortHeader label="날짜" active={sort.key === "date"} direction={sort.direction} onClick={() => sort.toggle("date")} />
                  <SortHeader label="사용처" active={sort.key === "merchant"} direction={sort.direction} onClick={() => sort.toggle("merchant")} />
                  <SortHeader label="구분" active={sort.key === "direction"} direction={sort.direction} onClick={() => sort.toggle("direction")} />
                  <SortHeader label="카테고리" active={sort.key === "category"} direction={sort.direction} onClick={() => sort.toggle("category")} />
                  {showInstallment && (
                    <SortHeader label="할부" active={sort.key === "installment"} direction={sort.direction} onClick={() => sort.toggle("installment")} />
                  )}
                  <SortHeader label="금액" align="right" active={sort.key === "amount"} direction={sort.direction} onClick={() => sort.toggle("amount")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const amount = signed(row, detail);
                  const category = ledger.snap.categories.find((item) => item.id === row.categoryId);
                  return (
                    <tr key={row.id} className="odd:bg-white">
                      <td className="border border-line px-2 py-1.5 tabular whitespace-nowrap">
                        {seoulDateKey(row.occurredAt)} {formatSeoulTime(row.occurredAt)}
                      </td>
                      <td className="border border-line px-2 py-1.5">{merchantLabel(row.merchant, ledger.snap.accounts.find((item) => item.id === row.accountId)?.name)}</td>
                      <td className="border border-line px-2 py-1.5 whitespace-nowrap">{directionLabel(row)}</td>
                      <td className="border border-line px-2 py-1.5 whitespace-nowrap">
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: category?.color ?? "#6f685e" }} />
                        {category?.name ?? "미분류"}
                      </td>
                      {showInstallment && <td className="border border-line px-2 py-1.5 tabular">{installmentOf(row)}</td>}
                      <td className={`border border-line px-2 py-1.5 text-right tabular ${amount < 0 || detail.kind === "income" ? "text-pine" : ""}`}>{won(amount)}</td>
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

type UsageColumn = "date" | "merchant" | "direction" | "category" | "installment" | "amount";

function patternValue(
  row: Transaction,
  key: UsageColumn,
  detail: Detail,
  categories: { id: string; name: string }[],
  accounts: { id: string; name: string }[],
): string | number {
  if (key === "date") return +new Date(row.occurredAt);
  if (key === "merchant") return merchantLabel(row.merchant, accounts.find((item) => item.id === row.accountId)?.name);
  if (key === "direction") return directionLabel(row);
  if (key === "category") return categories.find((item) => item.id === row.categoryId)?.name ?? "미분류";
  if (key === "installment") return installmentOf(row);
  return signed(row, detail);
}

function matches(transaction: Transaction, detail: Detail): boolean {
  if (!inMonth(transaction.occurredAt, detail.year, detail.month)) return false;
  if (detail.kind === "income") return incomeOf(transaction) !== 0;
  if (detail.categoryId !== undefined && (transaction.categoryId ?? "none") !== detail.categoryId) return false;
  return spendingOf(transaction) !== 0;
}

function signed(transaction: Transaction, detail: Detail): number {
  return detail.kind === "income" ? incomeOf(transaction) : spendingOf(transaction);
}

function directionLabel(transaction: Transaction): string {
  if (transaction.direction === "refund") return "취소";
  if (transaction.direction === "income") return "수입";
  return "지출";
}

function installmentOf(row: Transaction): string {
  const match = row.rawText?.match(/할부\s*(\d+\s*\/\s*\d+)/);
  return match ? match[1].replace(/\s+/g, "") : "";
}
