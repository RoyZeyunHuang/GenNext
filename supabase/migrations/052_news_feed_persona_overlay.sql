-- 新闻人格覆盖：虚拟人写的笔记版本替换原始新闻展示
-- 有值时前端用 persona_* 字段展示，原始 title/content 保留供"生成笔记"使用
alter table public.news_feed
  add column if not exists persona_name  text,
  add column if not exists persona_id    uuid,
  add column if not exists persona_title text,
  add column if not exists persona_body  text,
  add column if not exists persona_angle text;

comment on column public.news_feed.persona_name  is '虚拟人名字（有值时卡片显示此人格）';
comment on column public.news_feed.persona_id    is '关联的 personas.id';
comment on column public.news_feed.persona_title is '虚拟人笔记标题（替代原始 title 展示）';
comment on column public.news_feed.persona_body  is '虚拟人笔记正文（替代原始 content 展示）';
comment on column public.news_feed.persona_angle is '写作角度：share / experience / market';
