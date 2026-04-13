-- 人设可见性：从 is_public boolean 升级为多级权限
-- visibility: 'private' (仅管理员), 'main_site' (主站用户), 'public' (所有人), 'assigned' (指定用户)

-- 1. Add visibility column (default 'private'; migrate existing is_public=true → 'public')
alter table public.personas
  add column if not exists visibility text not null default 'private';

update public.personas set visibility = 'public' where is_public = true;
update public.personas set visibility = 'private' where is_public = false or is_public is null;

-- Add constraint after migration
alter table public.personas
  add constraint personas_visibility_check
  check (visibility in ('private', 'main_site', 'public', 'assigned'));

-- Index for filtering
create index if not exists personas_visibility_idx on public.personas (visibility);

comment on column public.personas.visibility is
  'private=仅管理员, main_site=主站用户可见, public=所有用户可见, assigned=指定用户可见';

-- 2. Junction table for assigned visibility
create table if not exists public.persona_allowed_users (
  persona_id uuid not null references public.personas(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (persona_id, user_id)
);

-- Open RLS (authorization in application layer, same as personas table)
alter table public.persona_allowed_users enable row level security;

create policy "Allow all persona_allowed_users"
  on public.persona_allowed_users for all
  using (true) with check (true);

comment on table public.persona_allowed_users is
  '人设指定可见用户，仅 visibility=assigned 时生效';
