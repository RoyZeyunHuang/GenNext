import { NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";

export type PersonaRagSession = NonNullable<Awaited<ReturnType<typeof getRfSession>>>;

export type PersonaRagRouteGate =
  | { ok: true; session: PersonaRagSession }
  | { ok: false; response: NextResponse };

/**
 * 人设 / RAG 相关 API：任意已登录用户可调用（数据按 user_id 隔离）。
 * 主站 UI 是否展示「人设 RAG」仍由 `canUseRagFeature`（has_main_access）控制；
 * Rednote Factory 内黑魔法等路由仅校验登录。
 */
export async function requirePersonaRagRoute(): Promise<PersonaRagRouteGate> {
  const session = await getRfSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "未登录" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}
