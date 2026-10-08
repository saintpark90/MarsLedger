-- 변동 자동이체, 급여일 여러 개, 목록 순서.
-- Supabase SQL Editor에서 이 파일을 실행하세요.

alter table public.recurring_transfers drop constraint if exists recurring_transfers_amount_check;
alter table public.recurring_transfers
  add constraint recurring_transfers_amount_check check (amount >= 0);

alter table public.recurring_transfers
  add column if not exists sort_order integer not null default 0;
alter table public.recurring_transfers
  add column if not exists reference_merchant text;
alter table public.recurring_transfers
  add column if not exists reference_transaction_id uuid;

alter table public.credit_cards
  add column if not exists sort_order integer not null default 0;

alter table public.recurring_marks
  add column if not exists amount numeric;
alter table public.recurring_marks
  alter column settled drop not null;

alter table public.salary_entries
  add column if not exists day_of_month integer;

update public.salary_entries as salary
set day_of_month = coalesce(
  (select settings.payday from public.user_settings as settings where settings.user_id = salary.user_id),
  25
)
where salary.day_of_month is null;

alter table public.salary_entries
  alter column day_of_month set default 25;

alter table public.salary_entries drop constraint if exists salary_entries_user_id_year_month_key;

create unique index if not exists salary_entries_user_month_day
  on public.salary_entries (user_id, year, month, day_of_month);
