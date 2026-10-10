-- 급여와 상여가 들어오는 통장.
-- Supabase SQL Editor에서 이 파일을 실행하세요.

alter table public.salary_entries
  add column if not exists account_id uuid references public.bank_accounts(id) on delete set null;
