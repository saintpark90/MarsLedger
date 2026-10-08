import type { ReactNode } from "react";
import { resolveAccount, transactionBank } from "../lib/accounts";
import { accountMark, cardMark, type Mark } from "../lib/marks";
import type { BankAccount, CreditCard, Transaction } from "../lib/types";

type Size = "sm" | "md";

export function AccountThumb({
  name,
  bankName = "",
  size = "md",
}: {
  name: string;
  bankName?: string;
  size?: Size;
}) {
  return <Thumb mark={accountMark(bankName, name)} size={size} />;
}

export function CardThumb({ name, color, size = "md" }: { name: string; color?: string; size?: Size }) {
  return <Thumb mark={cardMark(name, color)} size={size} />;
}

export function LedgerThumb({
  transaction,
  accounts,
  cards,
  size = "sm",
}: {
  transaction: Transaction;
  accounts: BankAccount[];
  cards: CreditCard[];
  size?: Size;
}) {
  const named = cards.find((card) => card.id === transaction.cardId);
  const byInstrument = transaction.instrument
    ? cards.find((card) => {
        const left = transaction.instrument!.replace(/\s+/g, "");
        const right = card.name.replace(/\s+/g, "");
        return left.includes(right) || right.includes(left);
      })
    : undefined;
  const card = named ?? byInstrument;
  const cardName = card?.name ?? ((transaction.method === "credit" || transaction.method === "debit") ? transaction.instrument : null);
  if (cardName) return <CardThumb name={cardName} color={card?.color} size={size} />;
  const account = resolveAccount(transaction, accounts);
  if (account) return <AccountThumb name={account.name} bankName={account.bankName} size={size} />;
  const bank = transactionBank(transaction);
  if (bank) return <AccountThumb name={bank} bankName={bank} size={size} />;
  return null;
}

export function AccountField({
  accounts,
  accountId,
  children,
}: {
  accounts: BankAccount[];
  accountId: string;
  children: ReactNode;
}) {
  const account = accounts.find((item) => item.id === accountId);
  return (
    <div className="flex items-center gap-2">
      {account && <AccountThumb name={account.name} bankName={account.bankName} size="sm" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Thumb({ mark, size }: { mark: Mark; size: Size }) {
  const box = size === "sm" ? "size-7 rounded-lg text-[9px]" : "size-10 rounded-xl text-[11px]";
  if (mark.icon) {
    return <img alt="" src={mark.icon} className={`inline-block shrink-0 bg-white object-cover ring-1 ring-black/10 ${box}`} />;
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center font-semibold tracking-tight ${box}`}
      style={{ background: mark.bg, color: mark.fg }}
    >
      {mark.label}
    </span>
  );
}
