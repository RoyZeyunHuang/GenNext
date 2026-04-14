-- 团队系统：teams + team_members
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  created_at  timestamptz not null default now()
);

create table if not exists public.team_members (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "Allow all teams" on public.teams for all using (true) with check (true);
create policy "Allow all team_members" on public.team_members for all using (true) with check (true);

create index if not exists team_members_team_id_idx on public.team_members (team_id);
create index if not exists team_members_user_id_idx on public.team_members (user_id);
create index if not exists teams_invite_code_idx on public.teams (invite_code);

comment on table public.teams is '团队';
comment on table public.team_members is '团队成员（owner/admin/member）';
