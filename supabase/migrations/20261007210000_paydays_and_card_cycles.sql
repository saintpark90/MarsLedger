-- Multiple paydays, and the statement window each credit card collects.
-- Run this in the Supabase SQL Editor after the recurring-account migration.

create table if not exists public.paydays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  day_of_month integer not null check (day_of_month between 1 and 31),
  account_id uuid references public.bank_accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.paydays enable row level security;
drop policy if exists own_rows on public.paydays;
create policy own_rows on public.paydays
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.paydays to authenticated;

insert into public.paydays (user_id, name, day_of_month)
select settings.user_id, '급여', settings.payday
from public.user_settings as settings
where not exists (
  select 1 from public.paydays as existing where existing.user_id = settings.user_id
);

alter table public.salary_entries
  add column if not exists payday_id uuid references public.paydays(id) on delete cascade;

update public.salary_entries as salaries
set payday_id = (
  select paydays.id
  from public.paydays as paydays
  where paydays.user_id = salaries.user_id
  order by paydays.created_at
  limit 1
)
where salaries.payday_id is null;

alter table public.salary_entries drop constraint if exists salary_entries_user_id_year_month_key;

create unique index if not exists salary_entries_user_payday_month_idx
  on public.salary_entries (user_id, payday_id, year, month);

alter table public.credit_cards
  add column if not exists cycle_start_day integer not null default 1,
  add column if not exists cycle_end_day integer not null default 31;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'credit_cards_cycle_start_day_check'
  ) then
    alter table public.credit_cards
      add constraint credit_cards_cycle_start_day_check check (cycle_start_day between 1 and 31);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'credit_cards_cycle_end_day_check'
  ) then
    alter table public.credit_cards
      add constraint credit_cards_cycle_end_day_check check (cycle_end_day between 1 and 31);
  end if;
end $$;
