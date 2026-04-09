import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** 默认每日上限；可用环境变量覆盖 */
export function getPersonaGenerateDailyLimit(): number {
  const raw = process.env.PERSONA_GENERATE_DAILY_LIMIT;
  if (raw == null || raw === "") return 15;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export function utcTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export type ConsumeSlotResult = {
  allowed: boolean;
  countAfter: number;
  limit: number;
};

/**
 * 原子扣一次黑魔法生成额度。需 SUPABASE_SERVICE_ROLE_KEY。
 * unlimited 用户在调用方跳过，勿调本函数。
 */
export async function tryConsumePersonaGenerateSlot(userId: string): Promise<ConsumeSlotResult | null> {
  const limit = getPersonaGenerateDailyLimit();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("try_consume_persona_generate_slot", {
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    console.error("[tryConsumePersonaGenerateSlot]", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return null;
  }

  const o = row as Record<string, unknown>;
  return {
    allowed: o.allowed === true,
    countAfter: typeof o.count_after === "number" ? o.count_after : Number(o.count_after) || 0,
    limit: typeof o.limit_val === "number" ? o.limit_val : Number(o.limit_val) || limit,
  };
}

export async function getPersonaGenerateUsageToday(userId: string): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 0;
  }
  const admin = getSupabaseAdmin();
  const d = utcTodayDateString();
  const { data, error } = await admin
    .from("persona_generate_daily_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("usage_date", d)
    .maybeSingle();

  if (error || !data) return 0;
  const c = (data as { count?: number }).count;
  return typeof c === "number" && c >= 0 ? c : 0;
}
