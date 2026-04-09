-- 黑魔法 / persona-generate 每日次数（UTC 自然日），由服务端 RPC 原子扣减

create table if not exists public.persona_generate_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, usage_date)
);

create index if not exists persona_generate_daily_usage_date_idx
  on public.persona_generate_daily_usage (usage_date);

alter table public.persona_generate_daily_usage enable row level security;

-- 仅 service_role / 后台通过 SECURITY DEFINER 函数访问；不开放给 anon
revoke all on public.persona_generate_daily_usage from public;
grant all on public.persona_generate_daily_usage to service_role;

create or replace function public.try_consume_persona_generate_slot (p_user_id uuid, p_limit int)
returns table (allowed boolean, count_after int, limit_val int)
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone ('utc', now ()))::date;
  v_count int;
begin
  limit_val := greatest (p_limit, 0);

  if p_limit is null or p_limit <= 0 then
    allowed := true;
    count_after := 0;
    return next;
    return;
  end if;

  v_count := null;

  insert into public.persona_generate_daily_usage (user_id, usage_date, count)
  values (p_user_id, d, 1)
  on conflict (user_id, usage_date)
  do update
    set count = persona_generate_daily_usage.count + 1
    where persona_generate_daily_usage.count < p_limit
  returning persona_generate_daily_usage.count into v_count;

  if v_count is not null then
    allowed := true;
    count_after := v_count;
    return next;
    return;
  end if;

  select coalesce (u.count, 0) into v_count
  from public.persona_generate_daily_usage u
  where u.user_id = p_user_id and u.usage_date = d;

  allowed := false;
  count_after := coalesce (v_count, 0);
  return next;
end;
$$;

revoke all on function public.try_consume_persona_generate_slot (uuid, int) from public;
grant execute on function public.try_consume_persona_generate_slot (uuid, int) to service_role;

comment on table public.persona_generate_daily_usage is 'persona-generate (黑魔法) daily quota; usage_date is UTC date.';
comment on function public.try_consume_persona_generate_slot (uuid, int) is 'Atomically increment count if below p_limit; returns allowed + count_after.';
