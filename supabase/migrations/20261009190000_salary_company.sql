-- 급여 카드의 회사명. 입금명이 이 이름으로 끝나면 그 금액을 급여 기준으로 씁니다.
-- Supabase SQL Editor에서 이 파일을 실행하세요.

alter table public.salary_entries
  add column if not exists company_name text;
