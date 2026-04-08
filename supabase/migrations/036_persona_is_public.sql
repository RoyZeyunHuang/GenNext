-- 人设对副程序（RF）可见：超管可标记 is_public，RF 用户仅可见自己的 + 公开的。

alter table public.personas
  add column if not exists is_public boolean not null default false;

create index if not exists personas_is_public_idx on public.personas (is_public) where is_public = true;

comment on column public.personas.is_public is 'true: visible to Rednote Factory users; main-site users always see all.';
