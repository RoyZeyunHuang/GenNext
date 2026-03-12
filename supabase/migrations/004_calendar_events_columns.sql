-- 若 calendar_events 已存在但缺少列（例如 schema cache 报错），可单独执行本迁移补全列
alter table public.calendar_events add column if not exists "date" date;
alter table public.calendar_events add column if not exists start_time time;
alter table public.calendar_events add column if not exists end_time time;
alter table public.calendar_events add column if not exists location text;
alter table public.calendar_events add column if not exists description text;
alter table public.calendar_events add column if not exists title text;
alter table public.calendar_events add column if not exists created_at timestamptz default now();
