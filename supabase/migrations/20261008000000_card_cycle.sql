-- Card billing cycles: usage window and which later month the bill leaves.
-- Run this in the Supabase SQL Editor.

alter table public.credit_cards
  add column if not exists period_start_offset integer not null default 0,
  add column if not exists period_start_day integer not null default 1,
  add column if not exists period_end_offset integer not null default 0,
  add column if not exists period_end_day integer not null default 31,
  add column if not exists payment_offset integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credit_cards_period_start_offset_check') then
    alter table public.credit_cards
      add constraint credit_cards_period_start_offset_check check (period_start_offset between 0 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_cards_period_start_day_check') then
    alter table public.credit_cards
      add constraint credit_cards_period_start_day_check check (period_start_day between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_cards_period_end_offset_check') then
    alter table public.credit_cards
      add constraint credit_cards_period_end_offset_check check (period_end_offset between 0 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_cards_period_end_day_check') then
    alter table public.credit_cards
      add constraint credit_cards_period_end_day_check check (period_end_day between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_cards_payment_offset_check') then
    alter table public.credit_cards
      add constraint credit_cards_payment_offset_check check (payment_offset between 0 and 3);
  end if;
end $$;
