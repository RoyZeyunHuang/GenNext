import { NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";

export type RfAdminGate =
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getRfSession>>> }
  | { ok: false; response: NextResponse };

/** 内容工厂超管（RF_ADMIN_EMAILS），用于管理用户权限、人设公开等 */
export async function requireRfAdmin(): Promise<RfAdminGate> {
  const session = await getRfSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  }
  if (!session.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}
