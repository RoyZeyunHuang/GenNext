-- Persona + RAG（人设 bio + 笔记向量检索）。独立表，不改旧 docs。
-- 注意：若仓库中已有 032_* 迁移，本文件序号为 033。

create extension if not exists vector;

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  short_description text,
  bio_md text not null default '',
  source_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index personas_user_id_idx on public.personas(user_id);

alter table public.personas enable row level security;

create policy "users can view own personas"
  on public.personas for select
  using (auth.uid() = user_id);

create policy "users can insert own personas"
  on public.personas for insert
  with check (auth.uid() = user_id);

create policy "users can update own personas"
  on public.personas for update
  using (auth.uid() = user_id);

create policy "users can delete own personas"
  on public.personas for delete
  using (auth.uid() = user_id);

create table public.persona_notes (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references public.personas on delete cascade not null,
  user_id uuid references auth.users not null,
  title text not null,
  body text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index persona_notes_persona_id_idx on public.persona_notes(persona_id);
create index persona_notes_embedding_idx
  on public.persona_notes
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.persona_notes enable row level security;

create policy "users can view own persona notes"
  on public.persona_notes for select
  using (auth.uid() = user_id);

create policy "users can manage own persona notes"
  on public.persona_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.match_persona_notes(
  p_persona_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 3
)
returns table (
  id uuid,
  title text,
  body text,
  similarity float
)
language sql stable
as $$
  select
    n.id,
    n.title,
    n.body,
    1 - (n.embedding <=> p_query_embedding) as similarity
  from public.persona_notes n
  where n.persona_id = p_persona_id
    and n.embedding is not null
  order by n.embedding <=> p_query_embedding
  limit p_match_count;
$$;
