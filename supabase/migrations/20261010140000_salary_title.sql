-- 급여와 상여를 구분하는 이름.
-- Supabase SQL Editor에서 이 파일을 실행하세요.

alter table public.salary_entries
  add column if not exists pay_name text;
