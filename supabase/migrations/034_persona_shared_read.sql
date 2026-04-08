-- 034: 开放 personas / persona_notes 的 SELECT 给所有已认证用户
-- 写操作（INSERT/UPDATE/DELETE）仍限制为 owner。

-- personas: 替换 SELECT 策略
drop policy if exists "users can view own personas" on public.personas;
create policy "authenticated users can view all personas"
  on public.personas for select
  using (auth.role() = 'authenticated');

-- persona_notes: 替换 SELECT 策略
drop policy if exists "users can view own persona notes" on public.persona_notes;
create policy "authenticated users can view all persona notes"
  on public.persona_notes for select
  using (auth.role() = 'authenticated');

-- match_persona_notes: 改为 security definer，确保向量检索不受 RLS 限制
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
security definer
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
