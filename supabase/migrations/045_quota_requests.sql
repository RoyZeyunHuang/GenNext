-- 额外用量申请记录
create table if not exists public.quota_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  reason      text not null default '',
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  granted_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.quota_requests enable row level security;

create policy "Allow all quota_requests"
  on public.quota_requests for all
  using (true) with check (true);

create index if not exists quota_requests_user_id_idx on public.quota_requests (user_id);
create index if not exists quota_requests_status_idx on public.quota_requests (status) where status = 'pending';

comment on table public.quota_requests is '黑魔法额外用量申请';
