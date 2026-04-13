-- 从每日 15 次改为每周 15 次（UTC 周一起算）
-- usage_date 字段含义变更为「本周一的日期」
-- 旧的每日行保留不删除，不影响新逻辑

-- 覆盖 RPC 函数：改为按周统计
create or replace function public.try_consume_persona_generate_slot (p_user_id uuid, p_limit int)
returns table (allowed boolean, count_after int, limit_val int)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 本周一 (UTC)
  d date := date_trunc('week', timezone('utc', now()))::date;
  v_count int;
begin
  limit_val := greatest(p_limit, 0);

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

  select coalesce(u.count, 0) into v_count
  from public.persona_generate_daily_usage u
  where u.user_id = p_user_id and u.usage_date = d;

  allowed := false;
  count_after := coalesce(v_count, 0);
  return next;
end;
$$;

comment on function public.try_consume_persona_generate_slot (uuid, int) is 'Atomically increment count if below p_limit; usage_date is now the Monday of the current UTC week.';
comment on table public.persona_generate_daily_usage is 'persona-generate quota usage; usage_date = Monday of that week (UTC).';
