-- 每个用户黑魔法（persona-generate）成功次数的终身累计（不按人格拆分）

create table if not exists public.user_persona_generate_totals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_generations bigint not null default 0 check (total_generations >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.user_persona_generate_totals is '用户维度：黑魔法生成成功累计次数（与 try_consume 同日频额度是不同概念；额度见 persona_generate_daily_usage）';

create index if not exists user_persona_generate_totals_updated_at_idx
  on public.user_persona_generate_totals (updated_at desc);

alter table public.user_persona_generate_totals enable row level security;

revoke all on public.user_persona_generate_totals from public;
grant select on public.user_persona_generate_totals to authenticated;
grant all on public.user_persona_generate_totals to service_role;

create policy user_persona_generate_totals_select_own
  on public.user_persona_generate_totals
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 旧签名仅两参；改为支持传入触发者 user_id 以累计「每用户」
drop function if exists public.increment_persona_rag_usage (uuid, uuid[]);

create or replace function public.increment_persona_rag_usage (
  p_persona_id uuid,
  p_note_ids uuid[],
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.personas
  set generate_invocation_count = coalesce(generate_invocation_count, 0) + 1
  where id = p_persona_id;

  update public.persona_notes n
  set rag_invocation_count = coalesce(n.rag_invocation_count, 0) + 1
  from (
    select distinct
      u as id
    from unnest(coalesce(p_note_ids, '{}'::uuid[])) as u
  ) x
  where n.id = x.id
    and n.persona_id = p_persona_id;

  if p_user_id is not null then
    insert into public.user_persona_generate_totals (user_id, total_generations, updated_at)
    values (p_user_id, 1, now())
    on conflict (user_id) do update
    set
      total_generations = public.user_persona_generate_totals.total_generations + 1,
      updated_at = now();
  end if;
end;
$$;

grant execute on function public.increment_persona_rag_usage (uuid, uuid[], uuid) to anon, authenticated, service_role;
