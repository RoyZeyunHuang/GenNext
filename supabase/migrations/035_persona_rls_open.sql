-- 035: personas / persona_notes RLS 改为与 docs 一致的完全开放。
-- 权限控制统一由 API 应用层（requirePersonaRagRoute guard）负责。

-- personas
drop policy if exists "authenticated users can view all personas" on public.personas;
drop policy if exists "users can insert own personas" on public.personas;
drop policy if exists "users can update own personas" on public.personas;
drop policy if exists "users can delete own personas" on public.personas;

create policy "Allow all on personas"
  on public.personas for all using (true) with check (true);

-- persona_notes
drop policy if exists "authenticated users can view all persona notes" on public.persona_notes;
drop policy if exists "users can manage own persona notes" on public.persona_notes;

create policy "Allow all on persona_notes"
  on public.persona_notes for all using (true) with check (true);
