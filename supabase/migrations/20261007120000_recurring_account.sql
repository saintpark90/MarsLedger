-- Which account a recurring transfer leaves, and the loan category.
-- Run this in the Supabase SQL Editor after the accounts migration.

alter table public.recurring_transfers
  add column if not exists account_id uuid references public.bank_accounts(id) on delete set null;

insert into public.categories (user_id, name, kind, color, sort_order)
select users.user_id, '대출', 'expense', '#6b3a4a', 12
from (select distinct user_id from public.categories) as users
where not exists (
  select 1
  from public.categories as existing
  where existing.user_id = users.user_id
    and existing.name = '대출'
);

insert into public.category_rules (user_id, category_id, keyword)
select categories.user_id, categories.id, keywords.keyword
from public.categories as categories
cross join (
  values ('원리금'), ('주택담보'), ('신용대출'), ('전세대출'), ('대출상환'), ('대출')
) as keywords(keyword)
where categories.name = '대출'
  and not exists (
    select 1
    from public.category_rules as rules
    where rules.user_id = categories.user_id
      and rules.keyword = keywords.keyword
  );
