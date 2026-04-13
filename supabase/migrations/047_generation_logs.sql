-- 黑魔法生成日志：记录每次生成的 prompt 和结果
create table if not exists public.generation_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  persona_id    uuid references public.personas(id) on delete set null,
  persona_name  text,
  prompt        text not null,
  result        text not null default '',
  article_length text,
  content_kind  text,
  rag_mode      text,
  task_template text,
  knowledge_doc text,
  created_at    timestamptz not null default now()
);

alter table public.generation_logs enable row level security;

create policy "Allow all generation_logs"
  on public.generation_logs for all
  using (true) with check (true);

create index if not exists generation_logs_user_id_idx on public.generation_logs (user_id);
create index if not exists generation_logs_created_at_idx on public.generation_logs (created_at desc);
create index if not exists generation_logs_persona_id_idx on public.generation_logs (persona_id);

comment on table public.generation_logs is '黑魔法每次生成的 prompt + 结果日志，供后台分析';
