-- 在 Supabase SQL Editor 中执行此文件，或使用 Supabase CLI 运行迁移

-- 1. 日历事项
create table if not exists public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date date not null,
  start_time text,
  end_time text,
  location text,
  description text,
  created_at timestamptz default now()
);

-- 2. 新闻摘要
create table if not exists public.news_items (
  id uuid default gen_random_uuid() primary key,
  source_url text,
  source_text text,
  summary_zh text,
  summary_en text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- 3. 待办事项
create table if not exists public.todos (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  done boolean default false,
  due_date date,
  created_at timestamptz default now()
);

-- 4. KPI 进度
create table if not exists public.kpi_entries (
  id uuid default gen_random_uuid() primary key,
  period text,
  period_type text,
  category text,
  metric_name text not null,
  value numeric not null,
  target numeric not null,
  created_at timestamptz default now()
);

-- 启用 RLS（可选：如需匿名读写可先不启用，或配置 policy 允许 all）
alter table public.calendar_events enable row level security;
alter table public.news_items enable row level security;
alter table public.todos enable row level security;
alter table public.kpi_entries enable row level security;

-- 允许匿名读写（开发/演示用；生产环境建议改为认证用户）
create policy "Allow anon read write calendar_events"
  on public.calendar_events for all using (true) with check (true);
create policy "Allow anon read write news_items"
  on public.news_items for all using (true) with check (true);
create policy "Allow anon read write todos"
  on public.todos for all using (true) with check (true);
create policy "Allow anon read write kpi_entries"
  on public.kpi_entries for all using (true) with check (true);
