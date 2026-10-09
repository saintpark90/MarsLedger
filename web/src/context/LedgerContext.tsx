import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultAccount, mainAccount, mirrorMainBalance, resolveAccount } from "../lib/accounts";
import { clearConnection, explainError, normalizeSupabaseUrl, readConnection, saveConnection } from "../lib/connection";
import { resolveCategoryId } from "../lib/classify";
import { createId } from "../lib/defaults";
import {
  currentEmail,
  deleteAccount,
  deleteCard,
  deleteCategory,
  deleteRecurring,
  deleteRecurringMark,
  deleteRule,
  deleteSalary,
  deleteTransaction,
  emptySnapshot,
  loadLocal,
  loadRemote,
  persistLocal,
  resetClientCache,
  saveAccount,
  saveCard,
  saveCardMark,
  saveCategory,
  saveRecurring,
  saveRecurringMark,
  saveRule,
  saveSalary,
  saveSettings,
  saveTransaction,
  saveTransactions,
  signIn as remoteSignIn,
  signOut as remoteSignOut,
  signUp as remoteSignUp,
} from "../lib/repository";
import { buildSample } from "../lib/sample";
import { seoulParts } from "../lib/format";
import type {
  BankAccount,
  CardMark,
  Category,
  CreditCard,
  Direction,
  LedgerSnapshot,
  PayMethod,
  Recurring,
  Rule,
  Settings,
  Transaction,
  TxSource,
} from "../lib/types";

type Phase = "loading" | "login" | "ready" | "error";

export type NewTransaction = {
  amount: number;
  merchant: string;
  rawText?: string | null;
  direction: Direction;
  method: PayMethod;
  instrument?: string | null;
  cardId?: string | null;
  categoryId?: string | null;
  source: TxSource;
  notificationKey?: string | null;
  packageName?: string | null;
  appLabel?: string | null;
  accountLast4?: string | null;
  accountId?: string | null;
  balanceAfter?: number | null;
  occurredAt: string;
  autoCategorized?: boolean;
};

type LedgerController = {
  phase: Phase;
  mode: "local" | "supabase";
  email: string | null;
  error: string | null;
  notice: string | null;
  snap: LedgerSnapshot;
  clearMessage: () => void;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  connectSupabase: (url: string, anonKey: string) => string | null;
  disconnectSupabase: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<boolean>;
  addAccount: (input: { name: string; bankName: string; last4: string; balance: number; isMain?: boolean }) => Promise<boolean>;
  updateAccount: (id: string, patch: Partial<BankAccount>) => Promise<boolean>;
  deleteAccount: (id: string) => Promise<boolean>;
  saveSalary: (year: number, month: number, amount: number, received: boolean, day?: number, company?: string) => Promise<boolean>;
  clearSalary: (year: number, month: number, day?: number) => Promise<boolean>;
  addTransaction: (input: NewTransaction) => Promise<boolean>;
  importTransactions: (inputs: NewTransaction[], notice?: string) => Promise<boolean>;
  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<boolean>;
  addCategory: (name: string, kind: Category["kind"], color: string) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  addRule: (categoryId: string, keyword: string) => Promise<boolean>;
  deleteRule: (id: string) => Promise<boolean>;
  reapplyRules: () => Promise<boolean>;
  addRecurring: (input: Omit<Recurring, "id">) => Promise<boolean>;
  updateRecurring: (id: string, patch: Partial<Recurring>) => Promise<boolean>;
  deleteRecurring: (id: string) => Promise<boolean>;
  setRecurringSettled: (id: string, year: number, month: number, settled: boolean | null) => Promise<boolean>;
  setRecurringAmount: (id: string, year: number, month: number, amount: number | null) => Promise<boolean>;
  reorderRecurring: (ids: string[]) => Promise<boolean>;
  reorderCards: (ids: string[]) => Promise<boolean>;
  reorderCategories: (ids: string[]) => Promise<boolean>;
  addCard: (input: Omit<CreditCard, "id">) => Promise<boolean>;
  updateCard: (id: string, patch: Partial<CreditCard>) => Promise<boolean>;
  deleteCard: (id: string) => Promise<boolean>;
  setCardMark: (mark: CardMark) => Promise<boolean>;
  loadSample: () => Promise<boolean>;
  resetDemo: () => Promise<boolean>;
};

const LedgerContext = createContext<LedgerController | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [mode, setMode] = useState<"local" | "supabase">("local");
  const [email, setEmail] = useState<string | null>(null);
  const [snap, setSnap] = useState<LedgerSnapshot>(emptySnapshot);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const refresh = useCallback(async () => {
    if (modeRef.current === "local") {
      setSnap(loadLocal());
      return;
    }
    setSnap(await loadRemote());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        if (!readConnection()) {
          if (cancelled) return;
          setMode("local");
          setSnap(loadLocal());
          setPhase("ready");
          return;
        }
        setMode("supabase");
        const signedInEmail = await currentEmail();
        if (cancelled) return;
        if (!signedInEmail) {
          setPhase("login");
          return;
        }
        setEmail(signedInEmail);
        setSnap(await loadRemote());
        if (!cancelled) setPhase("ready");
      } catch (caught) {
        if (cancelled) return;
        setError(explainError(caught));
        setPhase("error");
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "ready" || mode !== "supabase") return;
    const tick = () => {
      void refresh().catch((caught) => setError(explainError(caught)));
    };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [phase, mode, refresh]);

  async function commit(next: LedgerSnapshot, remote: () => Promise<void>): Promise<boolean> {
    setError(null);
    try {
      if (modeRef.current === "local") persistLocal(next);
      else await remote();
      setSnap(next);
      return true;
    } catch (caught) {
      setError(explainError(caught));
      return false;
    }
  }

  const controller = useMemo<LedgerController>(() => {
    return {
      phase,
      mode,
      email,
      error,
      notice,
      snap,
      clearMessage: () => {
        setError(null);
        setNotice(null);
      },
      refresh: async () => {
        try {
          await refresh();
        } catch (caught) {
          setError(explainError(caught));
        }
      },
      signIn: async (nextEmail, password) => {
        setError(null);
        await remoteSignIn(nextEmail, password);
        setEmail(nextEmail);
        setMode("supabase");
        setSnap(await loadRemote());
        setPhase("ready");
      },
      signUp: async (nextEmail, password) => {
        setError(null);
        const result = await remoteSignUp(nextEmail, password);
        if (result === "confirm") {
          setNotice("가입되었습니다. 이메일 인증을 켠 Supabase라면 메일함을 확인한 뒤 로그인해 주세요.");
          return;
        }
        setEmail(nextEmail);
        setMode("supabase");
        setSnap(await loadRemote());
        setPhase("ready");
      },
      signOut: async () => {
        await remoteSignOut();
        setEmail(null);
        setPhase("login");
      },
      connectSupabase: (url, anonKey) => {
        const normalized = normalizeSupabaseUrl(url);
        if (!normalized) return "https로 시작하는 Supabase 주소가 필요합니다.";
        if (anonKey.trim().length < 20) return "anon public 키를 확인해 주세요.";
        saveConnection({ url: normalized, anonKey: anonKey.trim() });
        resetClientCache();
        window.location.reload();
        return null;
      },
      disconnectSupabase: async () => {
        await remoteSignOut();
        clearConnection();
        resetClientCache();
        window.location.reload();
      },
      saveSettings: (settings) => {
        const main = mainAccount(snap);
        const accounts = snap.accounts.map((account) =>
          account.id === main.id ? { ...account, balance: settings.mainBalance, balanceAsOf: settings.balanceAsOf } : account,
        );
        const next = { ...snap, settings, accounts };
        return commit(next, async () => {
          await saveSettings(settings);
          const updated = accounts.find((account) => account.id === main.id);
          if (updated) await saveAccount(updated);
        });
      },
      addAccount: (input) => {
        const tail = input.last4.trim();
        if (tail && !/^\d{4}$/.test(tail)) return Promise.resolve(false);
        const account: BankAccount = {
          id: createId(),
          name: input.name.trim() || input.bankName.trim() || "통장",
          bankName: input.bankName.trim(),
          last4: tail,
          balance: input.balance,
          balanceAsOf: new Date().toISOString(),
          isMain: input.isMain ?? snap.accounts.length === 0,
          createdAt: new Date().toISOString(),
        };
        const accounts = account.isMain
          ? [...snap.accounts.map((item) => ({ ...item, isMain: false })), account]
          : [...snap.accounts, account];
        const next = mirrorMainBalance({ ...snap, accounts });
        return commit(next, async () => {
          await saveAccount(account);
          await saveSettings(next.settings);
        });
      },
      updateAccount: (id, patch) => {
        const current = snap.accounts.find((account) => account.id === id);
        if (!current) return Promise.resolve(false);
        const tail = patch.last4 !== undefined ? patch.last4.trim() : current.last4;
        if (tail && !/^\d{4}$/.test(tail)) return Promise.resolve(false);
        let accounts = snap.accounts.map((account) => (account.id === id ? { ...account, ...patch, last4: tail } : account));
        if (patch.isMain) accounts = accounts.map((account) => ({ ...account, isMain: account.id === id }));
        if (!accounts.some((account) => account.isMain) && accounts[0]) {
          accounts = accounts.map((account, index) => ({ ...account, isMain: index === 0 }));
        }
        const next = mirrorMainBalance({ ...snap, accounts });
        return commit(next, async () => {
          const changed = next.accounts.find((account) => account.id === id);
          if (!changed) return;
          await saveAccount(changed);
          if (patch.isMain) {
            for (const account of next.accounts) {
              if (account.id !== id) await saveAccount(account);
            }
          }
          await saveSettings(next.settings);
        });
      },
      deleteAccount: (id) => {
        let accounts = snap.accounts.filter((account) => account.id !== id);
        if (accounts.length === 0) {
          accounts = [defaultAccount({ ...snap.settings, mainBalance: 0, balanceAsOf: null })];
        } else if (!accounts.some((account) => account.isMain)) {
          accounts = accounts.map((account, index) => ({ ...account, isMain: index === 0 }));
        }
        const cards = snap.cards.map((card) => (card.paymentAccountId === id ? { ...card, paymentAccountId: null } : card));
        const transactions = snap.transactions.map((transaction) =>
          transaction.accountId === id ? { ...transaction, accountId: null } : transaction,
        );
        const next = mirrorMainBalance({ ...snap, accounts, cards, transactions });
        return commit(next, async () => {
          await deleteAccount(id);
          const promoted = next.accounts.find((account) => account.isMain);
          if (promoted) await saveAccount(promoted);
          await saveSettings(next.settings);
        });
      },
      saveSalary: (year, month, amount, received, day = snap.settings.payday, company = "") => {
        const existing = snap.salaries.find(
          (salary) => salary.year === year && salary.month === month && (salary.day ?? snap.settings.payday) === day,
        );
        const salary = { id: existing?.id ?? createId(), year, month, day, amount, received, company: company.trim() };
        const salaries = existing
          ? snap.salaries.map((item) => (item.id === existing.id ? salary : item))
          : [...snap.salaries, salary];
        return commit({ ...snap, salaries }, () => saveSalary(salary));
      },
      clearSalary: (year, month, day) =>
        commit(
          {
            ...snap,
            salaries: snap.salaries.filter((salary) => {
              if (salary.year !== year || salary.month !== month) return true;
              if (day == null) return false;
              return (salary.day ?? snap.settings.payday) !== day;
            }),
          },
          () => deleteSalary(year, month, day),
        ),
      addTransaction: (input) => {
        const transaction = buildTransaction(snap, input);
        return commit({ ...snap, transactions: [transaction, ...snap.transactions] }, () => saveTransaction(transaction));
      },
      importTransactions: async (inputs, note) => {
        const created = inputs
          .map((input) => buildTransaction(snap, input))
          .sort((left, right) => +new Date(right.occurredAt) - +new Date(left.occurredAt));
        if (created.length === 0) return false;
        const saved = await commit(
          { ...snap, transactions: [...created, ...snap.transactions] },
          () => saveTransactions(created),
        );
        if (saved) setNotice(note ?? `명세서에서 ${created.length}건을 넣었습니다.`);
        return saved;
      },
      updateTransaction: (id, patch) => {
        const current = snap.transactions.find((transaction) => transaction.id === id);
        if (!current) return Promise.resolve(false);
        let next: Transaction = { ...current, ...patch };
        if ("categoryId" in patch) next = { ...next, autoCategorized: false };
        if (patch.merchant && next.autoCategorized) {
          const resolved = resolveCategoryId(next.merchant, next.direction, snap.categories, snap.rules);
          next = { ...next, categoryId: resolved.categoryId };
        }
        return commit(
          { ...snap, transactions: snap.transactions.map((transaction) => (transaction.id === id ? next : transaction)) },
          () => saveTransaction(next),
        );
      },
      deleteTransaction: (id) =>
        commit(
          { ...snap, transactions: snap.transactions.filter((transaction) => transaction.id !== id) },
          () => deleteTransaction(id),
        ),
      addCategory: (name, kind, color) => {
        const category: Category = { id: createId(), name, kind, color, sort: snap.categories.length + 1 };
        return commit({ ...snap, categories: [...snap.categories, category] }, () => saveCategory(category));
      },
      deleteCategory: (id) =>
        commit(
          {
            ...snap,
            categories: snap.categories.filter((category) => category.id !== id),
            rules: snap.rules.filter((rule) => rule.categoryId !== id),
            transactions: snap.transactions.map((transaction) =>
              transaction.categoryId === id ? { ...transaction, categoryId: null } : transaction,
            ),
          },
          async () => {
            await deleteCategory(id);
          },
        ),
      addRule: (categoryId, keyword) => {
        const trimmed = keyword.trim();
        if (!trimmed) return Promise.resolve(false);
        if (snap.rules.some((rule) => rule.keyword.toLowerCase() === trimmed.toLowerCase())) {
          setError("이미 등록된 단어입니다.");
          return Promise.resolve(false);
        }
        const rule: Rule = { id: createId(), categoryId, keyword: trimmed };
        return commit({ ...snap, rules: [...snap.rules, rule] }, () => saveRule(rule));
      },
      deleteRule: (id) =>
        commit(
          { ...snap, rules: snap.rules.filter((rule) => rule.id !== id) },
          () => deleteRule(id),
        ),
      reapplyRules: () => {
        const changed: Transaction[] = [];
        const transactions = snap.transactions.map((transaction) => {
          if (!transaction.autoCategorized) return transaction;
          const resolved = resolveCategoryId(transaction.merchant, transaction.direction, snap.categories, snap.rules);
          if (resolved.categoryId === transaction.categoryId) return transaction;
          const next = { ...transaction, categoryId: resolved.categoryId, autoCategorized: true };
          changed.push(next);
          return next;
        });
        return commit({ ...snap, transactions }, () => saveTransactions(changed));
      },
      addRecurring: (input) => {
        const item: Recurring = { ...input, id: createId(), sort: snap.recurring.length };
        return commit({ ...snap, recurring: [...snap.recurring, item] }, () => saveRecurring(item));
      },
      updateRecurring: (id, patch) => {
        const current = snap.recurring.find((item) => item.id === id);
        if (!current) return Promise.resolve(false);
        const next = { ...current, ...patch };
        return commit(
          { ...snap, recurring: snap.recurring.map((item) => (item.id === id ? next : item)) },
          () => saveRecurring(next),
        );
      },
      deleteRecurring: (id) =>
        commit(
          {
            ...snap,
            recurring: snap.recurring.filter((item) => item.id !== id),
            recurringMarks: snap.recurringMarks.filter((mark) => mark.recurringId !== id),
          },
          () => deleteRecurring(id),
        ),
      setRecurringSettled: (id, year, month, settled) => {
        const existing = snap.recurringMarks.find((mark) => mark.recurringId === id && mark.year === year && mark.month === month);
        const drop = settled == null && existing?.amount == null;
        const marks = drop
          ? snap.recurringMarks.filter((mark) => mark !== existing)
          : upsertMark(snap.recurringMarks, { recurringId: id, year, month, settled, amount: existing?.amount ?? null });
        return commit({ ...snap, recurringMarks: marks }, async () => {
          if (drop) await deleteRecurringMark(id, year, month);
          else await saveRecurringMark({ recurringId: id, year, month, settled, amount: existing?.amount ?? null });
        });
      },
      setRecurringAmount: (id, year, month, amount) => {
        const existing = snap.recurringMarks.find((mark) => mark.recurringId === id && mark.year === year && mark.month === month);
        const drop = amount == null && existing?.settled == null;
        const marks = drop
          ? snap.recurringMarks.filter((mark) => mark !== existing)
          : upsertMark(snap.recurringMarks, { recurringId: id, year, month, settled: existing?.settled ?? null, amount });
        return commit({ ...snap, recurringMarks: marks }, async () => {
          if (drop) await deleteRecurringMark(id, year, month);
          else await saveRecurringMark({ recurringId: id, year, month, settled: existing?.settled ?? null, amount });
        });
      },
      reorderRecurring: (ids) => reorder(snap.recurring, ids, (recurring) => commit({ ...snap, recurring }, () => Promise.all(recurring.map((item) => saveRecurring(item))).then(() => undefined))),
      reorderCards: (ids) => reorder(snap.cards, ids, (cards) => commit({ ...snap, cards }, () => Promise.all(cards.map((card) => saveCard(card))).then(() => undefined))),
      reorderCategories: (ids) =>
        reorder(snap.categories, ids, (categories) =>
          commit({ ...snap, categories }, () => Promise.all(categories.map((category) => saveCategory(category))).then(() => undefined)),
        ),
      addCard: (input) => {
        const card: CreditCard = { ...input, id: createId(), name: input.name.trim(), sort: snap.cards.length };
        const transactions = snap.transactions.map((transaction) =>
          !transaction.cardId && instrumentMatches(transaction.instrument, card.name)
            ? { ...transaction, cardId: card.id }
            : transaction,
        );
        const changed = transactions.filter((transaction, index) => transaction !== snap.transactions[index]);
        return commit({ ...snap, cards: [...snap.cards, card], transactions }, async () => {
          await saveCard(card);
          await saveTransactions(changed);
        });
      },
      updateCard: (id, patch) => {
        const current = snap.cards.find((card) => card.id === id);
        if (!current) return Promise.resolve(false);
        const next = { ...current, ...patch };
        return commit(
          { ...snap, cards: snap.cards.map((card) => (card.id === id ? next : card)) },
          () => saveCard(next),
        );
      },
      deleteCard: (id) =>
        commit(
          {
            ...snap,
            cards: snap.cards.filter((card) => card.id !== id),
            cardMarks: snap.cardMarks.filter((mark) => mark.cardId !== id),
            transactions: snap.transactions.map((transaction) =>
              transaction.cardId === id ? { ...transaction, cardId: null } : transaction,
            ),
          },
          () => deleteCard(id),
        ),
      setCardMark: (mark) => {
        const marks = snap.cardMarks.filter((item) => !(item.cardId === mark.cardId && item.year === mark.year && item.month === mark.month));
        const nextMarks = mark.amount == null && mark.paid == null ? marks : [...marks, mark];
        return commit({ ...snap, cardMarks: nextMarks }, () => saveCardMark(mark));
      },
      loadSample: () => {
        if (modeRef.current !== "local") {
          setError("예시 데이터는 데모 모드에서만 넣습니다. Supabase에 연결된 장부는 건드리지 않습니다.");
          return Promise.resolve(false);
        }
        if (
          (snap.transactions.length > 0 || snap.cards.length > 0) &&
          !window.confirm("예시 데이터로 현재 데모 장부를 바꿀까요?")
        ) {
          return Promise.resolve(false);
        }
        const next = buildSample(snap.categories.length ? { ...snap, transactions: [], cards: [], recurring: [], salaries: [] } : emptySnapshot(), seoulParts());
        const withCatalog = snap.categories.length
          ? { ...next, categories: snap.categories, rules: snap.rules }
          : next;
        return commit(withCatalog, async () => undefined);
      },
      resetDemo: () => {
        if (modeRef.current !== "local") return Promise.resolve(false);
        return commit(emptySnapshot(), async () => undefined);
      },
    };
  }, [email, error, mode, notice, phase, refresh, snap]);

  return <LedgerContext.Provider value={controller}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerController {
  const value = useContext(LedgerContext);
  if (!value) throw new Error("장부 화면 밖에서 데이터를 요청했습니다.");
  return value;
}

function buildTransaction(snap: LedgerSnapshot, input: NewTransaction): Transaction {
  const resolved =
    input.categoryId !== undefined
      ? { categoryId: input.categoryId, autoCategorized: input.autoCategorized ?? input.categoryId === null }
      : resolveCategoryId(input.merchant, input.direction, snap.categories, snap.rules);
  const draft: Transaction = {
    id: createId(),
    amount: input.amount,
    merchant: input.merchant,
    rawText: input.rawText ?? null,
    direction: input.direction,
    method: input.method,
    instrument: input.instrument ?? null,
    cardId: input.cardId ?? matchCard(snap, input.instrument ?? null),
    categoryId: resolved.categoryId,
    source: input.source,
    notificationKey: input.notificationKey ?? null,
    packageName: input.packageName ?? null,
    appLabel: input.appLabel ?? null,
    accountLast4: input.accountLast4 ?? null,
    accountId: null,
    balanceAfter: input.balanceAfter ?? null,
    occurredAt: input.occurredAt,
    excluded: false,
    autoCategorized: input.autoCategorized ?? resolved.autoCategorized,
    createdAt: new Date().toISOString(),
  };
  return {
    ...draft,
    accountId: input.accountId !== undefined ? input.accountId : (resolveAccount(draft, snap.accounts)?.id ?? null),
  };
}

function matchCard(snap: LedgerSnapshot, instrument: string | null): string | null {
  if (!instrument) return null;
  return snap.cards.find((card) => instrumentMatches(instrument, card.name))?.id ?? null;
}

function instrumentMatches(instrument: string | null, cardName: string): boolean {
  if (!instrument) return false;
  const left = instrument.replace(/\s+/g, "");
  const right = cardName.replace(/\s+/g, "");
  return left.includes(right) || right.includes(left);
}

function reorder<T extends { id: string; sort?: number }>(
  items: T[],
  ids: string[],
  save: (next: T[]) => Promise<boolean>,
): Promise<boolean> {
  const ranked = ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is T => Boolean(item));
  const missing = items.filter((item) => !ids.includes(item.id));
  return save([...ranked, ...missing].map((item, sort) => ({ ...item, sort })));
}

function upsertMark(
  marks: LedgerSnapshot["recurringMarks"],
  mark: LedgerSnapshot["recurringMarks"][number],
): LedgerSnapshot["recurringMarks"] {
  const rest = marks.filter((item) => !(item.recurringId === mark.recurringId && item.year === mark.year && item.month === mark.month));
  return [...rest, mark];
}
