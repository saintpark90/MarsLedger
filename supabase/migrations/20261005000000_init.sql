-- Mars Ledger schema. Run this whole file in the Supabase SQL Editor.
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
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '식비', 'expense', '#c4533a', 1)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '피자헛'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '도미노피자'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '미스터피자'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '피자스쿨'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '맥도날드'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '버거킹'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '롯데리아'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '맘스터치'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), 'KFC'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '교촌치킨'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '굽네치킨'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '네네치킨'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), 'BBQ'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), 'bhc'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '처갓집'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '배달의민족'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '배민'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '요기요'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '쿠팡이츠'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '땡겨요'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '김밥'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '분식'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '식당'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '한식'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '중식'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '일식'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '초밥'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '횟집'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '삼겹'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '이마트24'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '이마트'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '홈플러스'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '롯데마트'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '코스트코'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), 'GS25'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '세븐일레븐'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), 'CU'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '편의점'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '파리바게뜨'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '뚜레쥬르'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '배스킨라빈스'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '던킨'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '마켓컬리'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '컬리'),
    (uid, (select id from public.categories where user_id = uid and name = '식비'), '오아시스')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '카페·간식', 'expense', '#8a5a2a', 2)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '스타벅스'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '투썸플레이스'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '투썸'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '이디야'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '메가커피'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '컴포즈커피'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '빽다방'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '할리스'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '커피빈'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '폴바셋'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '탐앤탐스'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '블루보틀'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '감성커피'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '카페'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '베이커리'),
    (uid, (select id from public.categories where user_id = uid and name = '카페·간식'), '설빙')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '교통비', 'expense', '#2a5278', 3)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '카카오T'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '카카오택시'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '타다'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '우버'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '지하철'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '버스'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '택시'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '티머니'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '캐시비'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '하이패스'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '한국도로공사'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '코레일'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), 'SRT'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '주유'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), 'SK에너지'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), 'GS칼텍스'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '에쓰오일'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), 'S-OIL'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '현대오일뱅크'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '주차장'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '쏘카'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '그린카'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '따릉이'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '킥고잉'),
    (uid, (select id from public.categories where user_id = uid and name = '교통비'), '지쿠')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '교육비', 'expense', '#3d6b4f', 4)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '학원'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '교보문고'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '영풍문고'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '알라딘'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '예스24'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '메가스터디'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '이투스'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '클래스101'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '인프런'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '패스트캠퍼스'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '자격증'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '문구'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '교재'),
    (uid, (select id from public.categories where user_id = uid and name = '교육비'), '인터넷강의')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '생활·쇼핑', 'expense', '#6b4b8a', 5)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '쿠팡'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '다이소'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '올리브영'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '무신사'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '지그재그'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '29CM'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '에이블리'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '세탁'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '이케아'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '한샘'),
    (uid, (select id from public.categories where user_id = uid and name = '생활·쇼핑'), '오늘의집')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '주거·공과금', 'expense', '#1f6b4a', 6)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '월세'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '관리비'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '전기요금'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '한국전력'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '도시가스'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '수도요금'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '아파트관리'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '전세이자'),
    (uid, (select id from public.categories where user_id = uid and name = '주거·공과금'), '부동산')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '통신', 'expense', '#2f6f8f', 7)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '통신'), 'SK텔레콤'),
    (uid, (select id from public.categories where user_id = uid and name = '통신'), 'SKT'),
    (uid, (select id from public.categories where user_id = uid and name = '통신'), 'LG유플러스'),
    (uid, (select id from public.categories where user_id = uid and name = '통신'), 'KT'),
    (uid, (select id from public.categories where user_id = uid and name = '통신'), '알뜰폰'),
    (uid, (select id from public.categories where user_id = uid and name = '통신'), '인터넷요금'),
    (uid, (select id from public.categories where user_id = uid and name = '통신'), '통신요금')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '의료·건강', 'expense', '#b6402c', 8)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '의료·건강'), '병원'),
    (uid, (select id from public.categories where user_id = uid and name = '의료·건강'), '의원'),
    (uid, (select id from public.categories where user_id = uid and name = '의료·건강'), '약국'),
    (uid, (select id from public.categories where user_id = uid and name = '의료·건강'), '치과'),
    (uid, (select id from public.categories where user_id = uid and name = '의료·건강'), '한의원'),
    (uid, (select id from public.categories where user_id = uid and name = '의료·건강'), '클리닉'),
    (uid, (select id from public.categories where user_id = uid and name = '의료·건강'), '검진')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '문화·구독', 'expense', '#a56b1a', 9)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '넷플릭스'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '유튜브 프리미엄'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '유튜브프리미엄'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '왓챠'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '디즈니플러스'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '티빙'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '웨이브'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), 'CGV'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '메가박스'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '롯데시네마'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '스포티파이'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '멜론'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '지니뮤직'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '닌텐도'),
    (uid, (select id from public.categories where user_id = uid and name = '문화·구독'), '스팀게임')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '경조사', 'expense', '#7a5344', 10)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '경조사'), '축의금'),
    (uid, (select id from public.categories where user_id = uid and name = '경조사'), '부의금'),
    (uid, (select id from public.categories where user_id = uid and name = '경조사'), '경조사'),
    (uid, (select id from public.categories where user_id = uid and name = '경조사'), '화환')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '금융', 'expense', '#3e4a3d', 11)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '금융'), '보험료'),
    (uid, (select id from public.categories where user_id = uid and name = '금융'), '보험'),
    (uid, (select id from public.categories where user_id = uid and name = '금융'), '적금'),
    (uid, (select id from public.categories where user_id = uid and name = '금융'), '대출이자'),
    (uid, (select id from public.categories where user_id = uid and name = '금융'), '카드론'),
    (uid, (select id from public.categories where user_id = uid and name = '금융'), '수수료')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '기타', 'expense', '#6f685e', 12)
  on conflict (user_id, name) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '급여', 'income', '#1e6a45', 13)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '급여'), '급여'),
    (uid, (select id from public.categories where user_id = uid and name = '급여'), '월급'),
    (uid, (select id from public.categories where user_id = uid and name = '급여'), '상여'),
    (uid, (select id from public.categories where user_id = uid and name = '급여'), '보너스')
  on conflict (user_id, keyword) do nothing;
  insert into public.categories (user_id, name, kind, color, sort_order)
  values (uid, '기타수입', 'income', '#3d7a5a', 14)
  on conflict (user_id, name) do nothing;
  insert into public.category_rules (user_id, category_id, keyword) values
    (uid, (select id from public.categories where user_id = uid and name = '기타수입'), '이자'),
    (uid, (select id from public.categories where user_id = uid and name = '기타수입'), '환급'),
    (uid, (select id from public.categories where user_id = uid and name = '기타수입'), '용돈')
  on conflict (user_id, keyword) do nothing;
end;
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
