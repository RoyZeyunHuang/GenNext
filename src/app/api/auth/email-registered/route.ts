import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGES = 50;
const PER_PAGE = 1000;

function normalizeEmail(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}

/**
 * 服务端用 Service Role 查询该邮箱是否已在 Auth 中注册（用于注册页预检）。
 * 未配置 SUPABASE_SERVICE_ROLE_KEY 时返回 registered: null，由前端依赖 signUp 的 identities 兜底。
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ registered: null as boolean | null, skipped: true });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : null;
    if (!email) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    let page = 1;
    for (; page <= MAX_PAGES; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        console.error("[email-registered]", error.message);
        return NextResponse.json({ error: "lookup failed" }, { status: 502 });
      }
      const users = data?.users ?? [];
      if (users.some((u) => (u.email ?? "").toLowerCase() === email)) {
        return NextResponse.json({ registered: true });
      }
      if (users.length < PER_PAGE) break;
    }

    return NextResponse.json({ registered: false });
  } catch (e) {
    console.error("[email-registered]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
