import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bankFromPackage, defaultAccount, normalizeSnapshot } from "./accounts";
import { defaultCardCycle } from "./cardCycle";
import { explainError, readConnection } from "./connection";
import { buildDefaultCatalog, catalogAdditions } from "./defaults";
import { last4FromText } from "./parseNotification";
import type {
  BankAccount,
  CardMark,
  Category,
  CreditCard,
  LedgerSnapshot,
  Recurring,
  RecurringMark,
  Rule,
  Salary,
  Settings,
  Transaction,
} from "./types";

const LOCAL_KEY = "marsledger.ledger.v1";

type Row = Record<string, unknown>;

let clientCache: { key: string; client: SupabaseClient } | null = null;

export function supabaseClient(config = readConnection()): SupabaseClient | null {
  if (!config) return null;
  const key = `${config.url}:${config.anonKey}`;
  if (clientCache?.key === key) return clientCache.client;
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, storageKey: "marsledger-auth", autoRefreshToken: true },
  });
  clientCache = { key, client };
  return client;
}

export function emptySnapshot(): LedgerSnapshot {
  const { categories, rules } = buildDefaultCatalog();
  const settings = { mainBalance: 0, balanceAsOf: null, payday: 25, syncBalance: true };
  return {
    settings,
    categories,
    rules,
    transactions: [],
    accounts: [defaultAccount(settings)],
    cards: [],
    recurring: [],
    salaries: [],
    recurringMarks: [],
    cardMarks: [],
  };
}

export function loadLocal(): LedgerSnapshot {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return persistLocal(emptySnapshot());
    const parsed = JSON.parse(raw) as { version?: number; snap?: LedgerSnapshot };
    if (parsed.version !== 1 || !parsed.snap) return persistLocal(emptySnapshot());
    const hadAccounts = Array.isArray(parsed.snap.accounts) && parsed.snap.accounts.length > 0;
    const normalized = withMissingCategories(normalizeSnapshot(parsed.snap));
    if (!hadAccounts || normalized.categories.length !== (parsed.snap.categories?.length ?? 0)) return persistLocal(normalized);
    return normalized;
  } catch {
    return persistLocal(emptySnapshot());
  }
}

export function persistLocal(snap: LedgerSnapshot): LedgerSnapshot {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: 1, snap }));
  return snap;
}

export async function signIn(email: string, password: string): Promise<void> {
  const client = requiredClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(explainError(error));
}

export async function signUp(email: string, password: string): Promise<"session" | "confirm"> {
  const client = requiredClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(explainError(error));
  return data.session ? "session" : "confirm";
}

export async function signOut(): Promise<void> {
  const client = supabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function currentEmail(): Promise<string | null> {
  const client = supabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function loadRemote(): Promise<LedgerSnapshot> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const [settingsRes, categoriesRes, rulesRes, txRes, accountsRes, cardsRes, recurringRes, salaryRes, recurringMarksRes, cardMarksRes] =
    await Promise.all([
      client.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      client.from("categories").select("*").eq("user_id", userId).order("sort_order"),
      client.from("category_rules").select("*").eq("user_id", userId),
      client.from("transactions").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(5000),
      client.from("bank_accounts").select("*").eq("user_id", userId).order("created_at"),
      client.from("credit_cards").select("*").eq("user_id", userId).order("created_at"),
      client.from("recurring_transfers").select("*").eq("user_id", userId).order("day_of_month"),
      client.from("salary_entries").select("*").eq("user_id", userId),
      client.from("recurring_marks").select("*").eq("user_id", userId),
      client.from("card_marks").select("*").eq("user_id", userId),
    ]);
  if (accountsRes.error) throw new Error(accountTableError(accountsRes.error));
  for (const result of [settingsRes, categoriesRes, rulesRes, txRes, cardsRes, recurringRes, salaryRes, recurringMarksRes, cardMarksRes]) {
    if (result.error) throw new Error(explainError(result.error));
  }

  let categories = ((categoriesRes.data ?? []) as Row[]).map(mapCategory);
  let rules = ((rulesRes.data ?? []) as Row[]).map(mapRule);
  if (categories.length === 0) {
    const seeded = await seedDefaults(client, userId);
    categories = seeded.categories;
    rules = seeded.rules;
  } else {
    const added = await insertMissingCategories(client, userId, categories, rules);
    categories = added.categories;
    rules = added.rules;
  }

  const settingsRow = settingsRes.data as Row | null;
  const loaded = {
    settings: settingsRow
      ? {
          mainBalance: Number(settingsRow.main_balance ?? 0),
          balanceAsOf: (settingsRow.balance_as_of as string | null) ?? null,
          payday: Number(settingsRow.payday ?? 25),
          syncBalance: Boolean(settingsRow.sync_balance ?? true),
        }
      : { mainBalance: 0, balanceAsOf: null, payday: 25, syncBalance: true },
    categories,
    rules,
    transactions: ((txRes.data ?? []) as Row[]).map(mapTransaction),
    accounts: ((accountsRes.data ?? []) as Row[]).map(mapAccount),
    cards: ((cardsRes.data ?? []) as Row[]).map(mapCard),
    recurring: ((recurringRes.data ?? []) as Row[]).map(mapRecurring),
    salaries: ((salaryRes.data ?? []) as Row[]).map(mapSalary),
    recurringMarks: ((recurringMarksRes.data ?? []) as Row[]).map(mapRecurringMark),
    cardMarks: ((cardMarksRes.data ?? []) as Row[]).map(mapCardMark),
  };
  return normalizeSnapshot(loaded);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("user_settings").upsert({
    user_id: userId,
    main_balance: settings.mainBalance,
    balance_as_of: settings.balanceAsOf,
    payday: settings.payday,
    sync_balance: settings.syncBalance,
  });
  if (error) throw new Error(explainError(error));
}

export async function saveTransaction(transaction: Transaction): Promise<void> {
  await saveTransactions([transaction]);
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  if (transactions.length === 0) return;
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("transactions").upsert(transactions.map((transaction) => toTransactionRow(transaction, userId)));
  if (error) throw new Error(explainError(error));
}

export async function deleteTransaction(id: string): Promise<void> {
  const client = requiredClient();
  const { error } = await client.from("transactions").delete().eq("id", id);
  if (error) throw new Error(explainError(error));
}

export async function saveCategory(category: Category): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("categories").upsert({
    id: category.id,
    user_id: userId,
    name: category.name,
    kind: category.kind,
    color: category.color,
    sort_order: category.sort,
  });
  if (error) throw new Error(explainError(error));
}

export async function deleteCategory(id: string): Promise<void> {
  const client = requiredClient();
  const { error } = await client.from("categories").delete().eq("id", id);
  if (error) throw new Error(explainError(error));
}

export async function saveRule(rule: Rule): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("category_rules").upsert({
    id: rule.id,
    user_id: userId,
    category_id: rule.categoryId,
    keyword: rule.keyword,
  });
  if (error) throw new Error(explainError(error));
}

export async function deleteRule(id: string): Promise<void> {
  const client = requiredClient();
  const { error } = await client.from("category_rules").delete().eq("id", id);
  if (error) throw new Error(explainError(error));
}

export async function saveRecurring(item: Recurring): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("recurring_transfers").upsert({
    id: item.id,
    user_id: userId,
    name: item.name,
    amount: item.amount,
    day_of_month: item.dayOfMonth,
    category_id: item.categoryId,
    account_id: item.accountId,
    enabled: item.enabled,
    sort_order: item.sort ?? 0,
    reference_merchant: item.referenceMerchant ?? null,
    reference_transaction_id: item.referenceTransactionId ?? null,
  });
  if (error) throw new Error(recurringAccountError(error));
}

export async function deleteRecurring(id: string): Promise<void> {
  const client = requiredClient();
  const { error } = await client.from("recurring_transfers").delete().eq("id", id);
  if (error) throw new Error(explainError(error));
}

export async function saveRecurringMark(mark: RecurringMark): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("recurring_marks").upsert({
    user_id: userId,
    recurring_id: mark.recurringId,
    year: mark.year,
    month: mark.month,
    settled: mark.settled,
    amount: mark.amount ?? null,
  });
  if (error) throw new Error(recurringAccountError(error));
}

export async function deleteRecurringMark(recurringId: string, year: number, month: number): Promise<void> {
  const client = requiredClient();
  const { error } = await client
    .from("recurring_marks")
    .delete()
    .eq("recurring_id", recurringId)
    .eq("year", year)
    .eq("month", month);
  if (error) throw new Error(explainError(error));
}

export async function saveCard(card: CreditCard): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("credit_cards").upsert({
    id: card.id,
    user_id: userId,
    name: card.name,
    payment_day: card.paymentDay,
    color: card.color,
    payment_account_id: card.paymentAccountId,
    period_start_offset: card.periodStartOffset,
    period_start_day: card.periodStartDay,
    period_end_offset: card.periodEndOffset,
    period_end_day: card.periodEndDay,
    payment_offset: card.paymentOffset,
    sort_order: card.sort ?? 0,
  });
  if (error) throw new Error(cardCycleError(error));
}

export async function saveAccount(account: BankAccount): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const last4 = /^\d{4}$/.test(account.last4) ? account.last4 : null;
  if (account.isMain) {
    const { error } = await client.from("bank_accounts").update({ is_main: false }).eq("user_id", userId).neq("id", account.id);
    if (error) throw new Error(explainError(error));
  }
  const { error } = await client.from("bank_accounts").upsert({
    id: account.id,
    user_id: userId,
    name: account.name,
    bank_name: account.bankName.trim(),
    last4,
    balance: account.balance,
    balance_as_of: account.balanceAsOf,
    is_main: account.isMain,
    created_at: account.createdAt,
  });
  if (error) throw new Error(explainError(error));
}

export async function deleteAccount(id: string): Promise<void> {
  const client = requiredClient();
  const { error } = await client.from("bank_accounts").delete().eq("id", id);
  if (error) throw new Error(explainError(error));
}

export async function deleteCard(id: string): Promise<void> {
  const client = requiredClient();
  const { error } = await client.from("credit_cards").delete().eq("id", id);
  if (error) throw new Error(explainError(error));
}

export async function saveCardMark(mark: CardMark): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  if (mark.amount == null && mark.paid == null) {
    const { error } = await client.from("card_marks").delete().eq("card_id", mark.cardId).eq("year", mark.year).eq("month", mark.month);
    if (error) throw new Error(explainError(error));
    return;
  }
  const { error } = await client.from("card_marks").upsert({
    user_id: userId,
    card_id: mark.cardId,
    year: mark.year,
    month: mark.month,
    amount: mark.amount,
    paid: mark.paid,
  });
  if (error) throw new Error(explainError(error));
}

export async function deleteSalary(year: number, month: number, day?: number): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  let query = client.from("salary_entries").delete().eq("user_id", userId).eq("year", year).eq("month", month);
  if (day != null) query = query.eq("day_of_month", day);
  const { error } = await query;
  if (error) throw new Error(salaryError(error));
}

export async function saveSalary(salary: Salary): Promise<void> {
  const client = requiredClient();
  const userId = await userIdOf(client);
  const { error } = await client.from("salary_entries").upsert(
    {
      id: salary.id,
      user_id: userId,
      year: salary.year,
      month: salary.month,
      day_of_month: salary.day ?? 25,
      amount: salary.amount,
      received: salary.received,
      company_name: salary.company?.trim() || null,
    },
    { onConflict: "user_id,year,month,day_of_month" },
  );
  if (error) throw new Error(salaryError(error));
}

function recurringAccountError(error: { message?: string; code?: string }): string {
  const message = `${error.message ?? ""} ${error.code ?? ""}`;
  if (/sort_order|reference_merchant|reference_transaction|amount >= 0|recurring_marks.*amount|schema cache|PGRST204/i.test(message)) {
    return "변동 자동이체와 순서를 쓰려면 Supabase SQL Editor에서 supabase/migrations/20261008160000_variable_order.sql 을 실행해 주세요.";
  }
  if (/account_id/i.test(message)) {
    return "자동이체 통장을 쓰려면 Supabase SQL Editor에서 supabase/migrations/20261007120000_recurring_account.sql 을 실행해 주세요.";
  }
  return explainError(error);
}

function salaryError(error: { message?: string; code?: string }): string {
  const message = `${error.message ?? ""} ${error.code ?? ""}`;
  if (/company_name/i.test(message)) {
    return "급여 회사명을 쓰려면 Supabase SQL Editor에서 supabase/migrations/20261009190000_salary_company.sql 을 실행해 주세요.";
  }
  if (/day_of_month|salary_entries_user_month_day|schema cache|PGRST204/i.test(message)) {
    return "급여일을 여러 개 쓰려면 Supabase SQL Editor에서 supabase/migrations/20261008160000_variable_order.sql 을 실행해 주세요.";
  }
  return explainError(error);
}

async function insertMissingCategories(
  client: SupabaseClient,
  userId: string,
  categories: Category[],
  rules: Rule[],
): Promise<{ categories: Category[]; rules: Rule[] }> {
  const extra = catalogAdditions(categories);
  if (extra.categories.length === 0) return { categories, rules };
  const { error: categoryError } = await client.from("categories").insert(
    extra.categories.map((category) => ({
      id: category.id,
      user_id: userId,
      name: category.name,
      kind: category.kind,
      color: category.color,
      sort_order: category.sort,
    })),
  );
  if (categoryError) return { categories, rules };
  const { error: ruleError } = await client.from("category_rules").insert(
    extra.rules.map((rule) => ({
      id: rule.id,
      user_id: userId,
      category_id: rule.categoryId,
      keyword: rule.keyword,
    })),
  );
  if (ruleError) return { categories: [...categories, ...extra.categories], rules };
  return { categories: [...categories, ...extra.categories], rules: [...rules, ...extra.rules] };
}

function withMissingCategories(snap: LedgerSnapshot): LedgerSnapshot {
  const extra = catalogAdditions(snap.categories);
  if (extra.categories.length === 0) return snap;
  return {
    ...snap,
    categories: [...snap.categories, ...extra.categories],
    rules: [...snap.rules, ...extra.rules],
  };
}

function accountTableError(error: { message?: string; code?: string }): string {
  const message = `${error.message ?? ""} ${error.code ?? ""}`;
  if (/bank_accounts|schema cache|does not exist|PGRST205|could not find the table/i.test(message)) {
    return "통장 기능을 쓰려면 Supabase SQL Editor에서 supabase/migrations/20261007000000_accounts.sql 을 실행해 주세요.";
  }
  return explainError(error);
}

function requiredClient(): SupabaseClient {
  const client = supabaseClient();
  if (!client) throw new Error("Supabase가 연결되지 않았습니다.");
  return client;
}

async function userIdOf(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return data.user.id;
}

async function seedDefaults(client: SupabaseClient, userId: string): Promise<{ categories: Category[]; rules: Rule[] }> {
  const seeded = buildDefaultCatalog();
  const { error: categoryError } = await client.from("categories").insert(
    seeded.categories.map((category) => ({
      id: category.id,
      user_id: userId,
      name: category.name,
      kind: category.kind,
      color: category.color,
      sort_order: category.sort,
    })),
  );
  if (categoryError) throw new Error(explainError(categoryError));
  const { error: ruleError } = await client.from("category_rules").insert(
    seeded.rules.map((rule) => ({
      id: rule.id,
      user_id: userId,
      category_id: rule.categoryId,
      keyword: rule.keyword,
    })),
  );
  if (ruleError) throw new Error(explainError(ruleError));
  const { error: settingsError } = await client.from("user_settings").upsert({ user_id: userId });
  if (settingsError) throw new Error(explainError(settingsError));
  return seeded;
}

function asDirection(value: unknown): Transaction["direction"] {
  if (value === "income" || value === "refund") return value;
  return "expense";
}

function asMethod(value: unknown): Transaction["method"] {
  if (value === "credit" || value === "debit" || value === "transfer") return value;
  return "unknown";
}

function mapCategory(row: Row): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind === "income" ? "income" : "expense",
    color: String(row.color),
    sort: Number(row.sort_order ?? 0),
  };
}

function mapRule(row: Row): Rule {
  return { id: String(row.id), categoryId: String(row.category_id), keyword: String(row.keyword) };
}

function mapTransaction(row: Row): Transaction {
  return {
    id: String(row.id),
    amount: Number(row.amount),
    merchant: String(row.merchant ?? ""),
    rawText: (row.raw_text as string | null) ?? null,
    direction: asDirection(row.direction),
    method: asMethod(row.method),
    instrument: (row.instrument as string | null) ?? null,
    cardId: (row.card_id as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    source: row.source === "manual" ? "manual" : "notification",
    notificationKey: (row.notification_key as string | null) ?? null,
    packageName: (row.package_name as string | null) ?? null,
    appLabel: (row.app_label as string | null) ?? bankFromPackage(row.package_name as string | null),
    accountLast4: (row.account_last4 as string | null) ?? last4FromText(String(row.raw_text ?? "")) ,
    accountId: (row.account_id as string | null) ?? null,
    balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
    occurredAt: String(row.occurred_at),
    excluded: Boolean(row.excluded),
    autoCategorized: row.auto_categorized !== false,
    createdAt: String(row.created_at ?? row.occurred_at),
  };
}

function cardCycleError(error: { message?: string; code?: string }): string {
  const message = `${error.message ?? ""} ${error.code ?? ""}`;
  if (/sort_order/i.test(message)) {
    return "카드 순서를 쓰려면 Supabase SQL Editor에서 supabase/migrations/20261008160000_variable_order.sql 을 실행해 주세요.";
  }
  if (/period_start_offset|period_end_offset|payment_offset|schema cache|PGRST204/i.test(message)) {
    return "카드 이용기간을 쓰려면 Supabase SQL Editor에서 supabase/migrations/20261008000000_card_cycle.sql 을 실행해 주세요.";
  }
  return explainError(error);
}

function mapCard(row: Row): CreditCard {
  return {
    ...defaultCardCycle,
    id: String(row.id),
    name: String(row.name),
    paymentDay: Number(row.payment_day),
    color: String(row.color ?? "#1e6a45"),
    paymentAccountId: (row.payment_account_id as string | null) ?? null,
    periodStartOffset: finiteNumber(row.period_start_offset, defaultCardCycle.periodStartOffset),
    periodStartDay: finiteNumber(row.period_start_day, defaultCardCycle.periodStartDay),
    periodEndOffset: finiteNumber(row.period_end_offset, defaultCardCycle.periodEndOffset),
    periodEndDay: finiteNumber(row.period_end_day, defaultCardCycle.periodEndDay),
    paymentOffset: finiteNumber(row.payment_offset, defaultCardCycle.paymentOffset),
    sort: row.sort_order == null ? undefined : Number(row.sort_order),
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mapAccount(row: Row): BankAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    bankName: String(row.bank_name ?? ""),
    last4: row.last4 == null ? "" : String(row.last4),
    balance: Number(row.balance ?? 0),
    balanceAsOf: (row.balance_as_of as string | null) ?? null,
    isMain: Boolean(row.is_main),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapRecurring(row: Row): Recurring {
  return {
    id: String(row.id),
    name: String(row.name),
    amount: Number(row.amount),
    dayOfMonth: Number(row.day_of_month),
    categoryId: (row.category_id as string | null) ?? null,
    accountId: (row.account_id as string | null) ?? null,
    enabled: Boolean(row.enabled),
    sort: row.sort_order == null ? undefined : Number(row.sort_order),
    referenceMerchant: (row.reference_merchant as string | null) ?? null,
    referenceTransactionId: (row.reference_transaction_id as string | null) ?? null,
  };
}

function mapSalary(row: Row): Salary {
  return {
    id: String(row.id),
    year: Number(row.year),
    month: Number(row.month),
    day: row.day_of_month == null ? undefined : Number(row.day_of_month),
    amount: Number(row.amount),
    received: Boolean(row.received),
    company: row.company_name == null ? "" : String(row.company_name),
  };
}

function mapRecurringMark(row: Row): RecurringMark {
  return {
    recurringId: String(row.recurring_id),
    year: Number(row.year),
    month: Number(row.month),
    settled: row.settled == null ? null : Boolean(row.settled),
    amount: row.amount == null ? null : Number(row.amount),
  };
}

function mapCardMark(row: Row): CardMark {
  return {
    cardId: String(row.card_id),
    year: Number(row.year),
    month: Number(row.month),
    amount: row.amount == null ? null : Number(row.amount),
    paid: row.paid == null ? null : Boolean(row.paid),
  };
}

export function resetClientCache(): void {
  clientCache = null;
}

function toTransactionRow(transaction: Transaction, userId: string) {
  return {
    id: transaction.id,
    user_id: userId,
    amount: transaction.amount,
    merchant: transaction.merchant,
    raw_text: transaction.rawText,
    direction: transaction.direction,
    method: transaction.method,
    instrument: transaction.instrument,
    card_id: transaction.cardId,
    category_id: transaction.categoryId,
    source: transaction.source,
    notification_key: transaction.notificationKey,
    package_name: transaction.packageName,
    app_label: transaction.appLabel,
    account_last4: /^\d{4}$/.test(transaction.accountLast4 ?? "") ? transaction.accountLast4 : null,
    account_id: transaction.accountId,
    balance_after: transaction.balanceAfter,
    occurred_at: transaction.occurredAt,
    excluded: transaction.excluded,
    auto_categorized: transaction.autoCategorized,
    created_at: transaction.createdAt,
  };
}
