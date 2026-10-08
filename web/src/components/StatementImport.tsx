import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLedger, type NewTransaction } from "../context/LedgerContext";
import { won } from "../lib/format";
import {
  planImport,
  readStatementFile,
  statementInstant,
  statementRaw,
  suggestCardId,
  type StatementFile,
} from "../lib/parseStatement";
import { CardThumb } from "./Thumbs";
import { Button, SelectInput } from "./Ui";

export function StatementImport({ onImported }: { onImported: (months: string[]) => void }) {
  const ledger = useLedger();
  const fileRef = useRef<HTMLInputElement>(null);
  const [statement, setStatement] = useState<StatementFile | null>(null);
  const [cardMap, setCardMap] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<boolean[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const statementCards = useMemo(() => {
    if (!statement) return [];
    return [...new Set(statement.rows.map((row) => row.statementCard))];
  }, [statement]);

  const plan = useMemo(() => {
    if (!statement) return { indexes: [], skipped: 0, unassigned: 0 };
    return planImport(statement.rows, picked, cardMap, ledger.snap.transactions);
  }, [statement, picked, cardMap, ledger.snap.transactions]);

  async function onFile(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    try {
      const parsed = await readStatementFile(file);
      const names = [...new Set(parsed.rows.map((row) => row.statementCard))];
      setStatement(parsed);
      setCardMap(Object.fromEntries(names.map((name) => [name, suggestCardId(name, ledger.snap.cards) ?? ""])));
      setPicked(parsed.rows.map(() => true));
    } catch (caught) {
      setStatement(null);
      setMessage(caught instanceof Error ? caught.message : "명세서를 읽지 못했습니다.");
    }
  }

  async function commit() {
    if (!statement || plan.indexes.length === 0) return;
    const inputs: NewTransaction[] = plan.indexes.map((index) => {
      const row = statement.rows[index];
      const card = ledger.snap.cards.find((item) => item.id === cardMap[row.statementCard]);
      return {
        amount: row.amount,
        merchant: row.merchant,
        rawText: statementRaw(row, statement.title),
        direction: row.direction,
        method: "credit",
        instrument: card?.name ?? row.statementCard,
        cardId: card?.id ?? null,
        source: "manual",
        occurredAt: statementInstant(row.occurredOn),
      };
    });
    setBusy(true);
    const saved = await ledger.importTransactions(inputs);
    setBusy(false);
    if (!saved) return;
    onImported([...new Set(inputs.map((input) => input.occurredAt.slice(0, 7)))]);
    setStatement(null);
    setPicked([]);
  }

  const view = statement
    ? statement.rows
        .map((row, index) => ({ row, index }))
        .sort((left, right) => right.row.occurredOn.localeCompare(left.row.occurredOn) || right.index - left.index)
    : [];

  return (
    <section className="sheet space-y-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-medium">카드 명세서 가져오기</h3>
          <p className="text-sm text-muted">카드사에서 받은 이용대금명세서 엑셀을 올리면 사용 내역으로 넣습니다. 파일 안의 카드마다 장부의 카드를 고릅니다.</p>
        </div>
        <Button tone="ghost" onClick={() => fileRef.current?.click()}>
          엑셀 올리기
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx,.html,.htm,text/html,application/vnd.ms-excel"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
      </div>
      {message && <p className="text-sm text-clay">{message}</p>}
      {ledger.snap.cards.length === 0 && (
        <p className="text-sm text-muted">
          등록된 신용카드가 없습니다. <Link className="text-pine underline" to="/cards">카드</Link>에서 만든 뒤 올려 주세요.
        </p>
      )}
      {statement && (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-sm text-muted">
            {statement.title} · {statement.rows.length}건
            {plan.skipped > 0 ? ` · 이미 있는 ${plan.skipped}건은 빼 둡니다` : ""}
            {plan.unassigned > 0 ? ` · 카드를 고르지 않은 ${plan.unassigned}건은 빠집니다` : ""}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {statementCards.map((name) => {
              const selected = ledger.snap.cards.find((card) => card.id === cardMap[name]);
              return (
                <label key={name} className="block">
                  <span className="mb-1.5 block text-sm text-muted">{name}</span>
                  <div className="flex items-center gap-2">
                    <CardThumb name={selected?.name ?? name} color={selected?.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <SelectInput
                        value={cardMap[name] ?? ""}
                        onChange={(event) => setCardMap((current) => ({ ...current, [name]: event.target.value }))}
                      >
                        <option value="">가져오지 않음</option>
                        {ledger.snap.cards.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.name}
                          </option>
                        ))}
                      </SelectInput>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {view.map(({ row, index }) => (
              <li key={row.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked[index] ?? false}
                  onChange={(event) =>
                    setPicked((current) => current.map((value, itemIndex) => (itemIndex === index ? event.target.checked : value)))
                  }
                />
                <span className="w-24 shrink-0 tabular text-muted">{row.occurredOn}</span>
                <span className="min-w-0 flex-1 truncate">{row.merchant}</span>
                {row.installment && (
                  <span className="shrink-0 text-muted">
                    할부 {row.installment}
                    {row.billed !== row.spent ? ` · 이번 ${won(row.billed)}` : ""}
                  </span>
                )}
                <span className="shrink-0 tabular">{won(row.amount)}</span>
              </li>
            ))}
          </ul>
          {statement.rows.some((row) => row.installment && row.billed !== row.spent) && (
            <p className="text-sm text-muted">할부는 사용일의 이용금액 전체를 한 번만 넣습니다. 다음 명세서에 같은 할부가 있어도 다시 넣지 않습니다.</p>
          )}
          <Button tone="ink" disabled={busy || plan.indexes.length === 0} onClick={() => void commit()}>
            {plan.indexes.length}건 넣기
          </Button>
        </div>
      )}
    </section>
  );
}
