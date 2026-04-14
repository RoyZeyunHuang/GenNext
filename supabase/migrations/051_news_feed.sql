-- 新闻推送系统：外部爬虫写入，RF 用户阅读 / 收藏 / 一键生成文案
create table if not exists public.news_feed (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  summary      text,                          -- 摘要（列表页展示）
  content      text not null default '',      -- 全文
  source_url   text,                          -- 原文链接
  source_name  text,                          -- 来源名称（如 "36氪"、"界面"）
  image_url    text,                          -- 封面图
  tags         text[] default '{}',           -- 标签（如 "纽约地产"、"市场趋势"）
  published_at timestamptz not null default now(),  -- 文章发布时间
  created_at   timestamptz not null default now()   -- 入库时间
);

create table if not exists public.news_bookmarks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_feed(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, article_id)
);

alter table public.news_feed enable row level security;
alter table public.news_bookmarks enable row level security;

create policy "Allow all news_feed" on public.news_feed for all using (true) with check (true);
create policy "Allow all news_bookmarks" on public.news_bookmarks for all using (true) with check (true);

create index if not exists news_feed_published_at_idx on public.news_feed (published_at desc);
create index if not exists news_feed_tags_idx on public.news_feed using gin (tags);
create index if not exists news_bookmarks_user_id_idx on public.news_bookmarks (user_id);
create index if not exists news_bookmarks_article_id_idx on public.news_bookmarks (article_id);

comment on table public.news_feed is '每日新闻推送，由外部爬虫通过 ingest API 写入';
comment on table public.news_bookmarks is '用户收藏的新闻文章';
