-- 档案库文档表（content 为 text 类型，可存大文本；file_url 可存文件名或留空）
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  name text,
  type text,
  content text,
  file_url text,
  created_at timestamptz default now()
);

-- RLS：启用后需 policy 允许匿名读写，否则 API 无法查表
alter table public.documents enable row level security;
create policy "Allow anon read write documents"
  on public.documents for all using (true) with check (true);

-- 文案生成结果表
create table if not exists public.generated_copies (
  id uuid default gen_random_uuid() primary key,
  document_ids text[] default '{}',
  prompt text,
  output text,
  type text,
  starred boolean default false,
  created_at timestamptz default now()
);

alter table public.generated_copies enable row level security;
create policy "Allow anon read write generated_copies"
  on public.generated_copies for all using (true) with check (true);

