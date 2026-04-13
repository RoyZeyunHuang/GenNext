-- 041: personas 增加 self_intro 字段，存储小红书风格的虚拟人自我介绍。

alter table public.personas
  add column if not exists self_intro text;

comment on column public.personas.self_intro is 'AI-generated self-introduction in the persona''s XHS voice: name, age, background, mini-bio.';
