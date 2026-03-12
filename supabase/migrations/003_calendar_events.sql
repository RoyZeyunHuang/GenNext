-- 日历事件表（AI 识别后保存）
create table if not exists public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  title text,
  "date" date,
  start_time time,
  end_time time,
  location text,
  description text,
  created_at timestamptz default now()
);

alter table public.calendar_events enable row level security;
create policy "Allow anon read write calendar_events"
  on public.calendar_events for all using (true) with check (true);
