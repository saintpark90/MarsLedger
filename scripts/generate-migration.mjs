import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "shared", "categories.json"), "utf8"));
const esc = (value) => String(value).replaceAll("'", "''");

let seed = "";
for (const category of catalog) {
  seed += `  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '${esc(category.name)}', '${esc(category.kind)}', '${esc(category.color)}', ${Number(category.sort)})
  on conflict (user_id, name) do nothing;\n`;
  if (!category.keywords?.length) continue;
  const values = category.keywords
    .map(
      (keyword) =>
        `    (uid, (select id from public.categories where user_id = uid and name = '${esc(category.name)}'), '${esc(keyword)}')`,
    )
    .join(",\n");
  seed += `  insert into public.category_rules (user_id, category_id, keyword) values\n${values}\n  on conflict (user_id, keyword) do nothing;\n`;
}

const sql = `-- Mars Ledger schema. Run this whole file in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  main_balance numeric not null default 0,
  balance_as_of timestamptz,
  payday integer not null default 25 check (payday between 1 and 31),
  sync_balance boolean not null default true
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  color text not null default '#6f685e',
  sort_order integer not null default 0,
  unique (user_id, name)
);

create table if not exists public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  keyword text not null,
  unique (user_id, keyword)
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  payment_day integer not null check (payment_day between 1 and 31),
  color text not null default '#1a4f8b',
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  category_id uuid references public.categories(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  merchant text not null default '',
  raw_text text,
  direction text not null check (direction in ('expense', 'income', 'refund')),
  method text not null default 'unknown' check (method in ('credit', 'debit', 'transfer', 'unknown')),
  instrument text,
  card_id uuid references public.credit_cards(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  source text not null default 'manual' check (source in ('notification', 'manual')),
  notification_key text unique,
  package_name text,
  balance_after numeric,
  occurred_at timestamptz not null default now(),
  excluded boolean not null default false,
  auto_categorized boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.salary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  amount numeric not null check (amount >= 0),
  received boolean not null default false,
  unique (user_id, year, month)
);

create table if not exists public.recurring_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_id uuid not null references public.recurring_transfers(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  settled boolean not null,
  primary key (recurring_id, year, month)
);

create table if not exists public.card_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  amount numeric,
  paid boolean,
  primary key (card_id, year, month)
);

create index if not exists transactions_user_time_idx on public.transactions (user_id, occurred_at desc);
create index if not exists category_rules_user_idx on public.category_rules (user_id);

alter table public.user_settings enable row level security;
alter table public.categories enable row level security;
alter table public.category_rules enable row level security;
alter table public.credit_cards enable row level security;
alter table public.recurring_transfers enable row level security;
alter table public.transactions enable row level security;
alter table public.salary_entries enable row level security;
alter table public.recurring_marks enable row level security;
alter table public.card_marks enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_settings',
    'categories',
    'category_rules',
    'credit_cards',
    'recurring_transfers',
    'transactions',
    'salary_entries',
    'recurring_marks',
    'card_marks'
  ]
  loop
    execute format('drop policy if exists own_rows on public.%I', table_name);
    execute format(
      'create policy own_rows on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name
    );
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

create or replace function public.seed_ledger_for_user(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_settings (user_id) values (uid) on conflict (user_id) do nothing;
${seed}end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_ledger_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.seed_ledger_for_user(uuid) from public;
revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to supabase_auth_admin;
`;

const out = join(root, "supabase", "migrations");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "20261005000000_init.sql"), sql);
console.log("wrote migration");
