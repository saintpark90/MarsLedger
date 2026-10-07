-- Multiple bank accounts, card payment account, and notification app identity.
-- Run this in the Supabase SQL Editor after the initial schema.

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank_name text not null default '',
  last4 text,
  balance numeric not null default 0,
  balance_as_of timestamptz,
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  check (last4 is null or last4 ~ '^[0-9]{4}$')
);

create unique index if not exists bank_accounts_one_main_idx
  on public.bank_accounts (user_id)
  where is_main;

alter table public.credit_cards
  add column if not exists payment_account_id uuid references public.bank_accounts(id) on delete set null;

alter table public.transactions
  add column if not exists app_label text,
  add column if not exists account_last4 text,
  add column if not exists account_id uuid references public.bank_accounts(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_account_last4_check'
  ) then
    alter table public.transactions
      add constraint transactions_account_last4_check
      check (account_last4 is null or account_last4 ~ '^[0-9]{4}$');
  end if;
end $$;

alter table public.bank_accounts enable row level security;
drop policy if exists own_rows on public.bank_accounts;
create policy own_rows on public.bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.bank_accounts to authenticated;

insert into public.bank_accounts (user_id, name, bank_name, balance, balance_as_of, is_main)
select user_id, '메인 통장', '', main_balance, balance_as_of, true
from public.user_settings as settings
where not exists (
  select 1 from public.bank_accounts as accounts where accounts.user_id = settings.user_id
);
