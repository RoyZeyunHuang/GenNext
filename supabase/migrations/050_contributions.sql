-- 团队贡献度追踪
create table if not exists public.team_contributions (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null check (action in ('doc_create', 'doc_edit', 'doc_share', 'generation')),
  points     int not null default 1,
  ref_id     uuid,
  created_at timestamptz not null default now()
);

alter table public.team_contributions enable row level security;

create policy "Allow all team_contributions" on public.team_contributions for all using (true) with check (true);

create index if not exists team_contributions_team_user_idx on public.team_contributions (team_id, user_id);
create index if not exists team_contributions_created_at_idx on public.team_contributions (created_at desc);

comment on table public.team_contributions is '团队贡献度记录（创建/编辑/分享文档、AI 生成）';
