-- 040: personas 增加 source_persona_id 字段，记录 fork 来源。

alter table public.personas
  add column if not exists source_persona_id uuid references public.personas on delete set null;

comment on column public.personas.source_persona_id is 'The public persona this was forked from, null if created from scratch.';
