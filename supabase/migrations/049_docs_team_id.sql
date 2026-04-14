-- 为 docs 和 doc_categories 添加 team_id 支持团队文档
alter table public.docs add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.doc_categories add column if not exists team_id uuid references public.teams(id) on delete cascade;

create index if not exists docs_team_id_idx on public.docs (team_id) where team_id is not null;
create index if not exists doc_categories_team_id_idx on public.doc_categories (team_id) where team_id is not null;

comment on column public.docs.team_id is 'NULL = 非团队文档，有值 = 团队共享文档';
comment on column public.doc_categories.team_id is 'NULL = 非团队分类，有值 = 团队专属分类';
