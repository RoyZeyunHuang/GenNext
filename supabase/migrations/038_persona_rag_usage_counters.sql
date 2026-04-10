-- 黑魔法：人格调用次数 + RAG 命中的笔记原文被带入上下文的次数

alter table public.personas
  add column if not exists generate_invocation_count bigint not null default 0;

alter table public.persona_notes
  add column if not exists rag_invocation_count bigint not null default 0;

comment on column public.personas.generate_invocation_count is '人格参与黑魔法生成（persona-generate）累计次数';
comment on column public.persona_notes.rag_invocation_count is '该条笔记在黑魔法 RAG 中被检索并入上下文的累计次数（按命中的条数各 +1）';

create or replace function public.increment_persona_rag_usage(
  p_persona_id uuid,
  p_note_ids uuid[]
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
    select distinct u as id
    from unnest(coalesce(p_note_ids, '{}'::uuid[])) as u
  ) x
  where n.id = x.id
    and n.persona_id = p_persona_id;
end;
$$;

grant execute on function public.increment_persona_rag_usage(uuid, uuid[]) to anon, authenticated, service_role;
