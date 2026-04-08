import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isRfAdmin } from "@/lib/rf-admin";
import { requireRfAdmin } from "@/lib/require-rf-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_PAGE = 200;
const MAX_PAGES = 100;

export async function GET() {
  const gate = await requireRfAdmin();
  if (!gate.ok) return gate.response;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY，无法列出用户" },
      { status: 503 }
    );
  }

  try {
    const admin = getSupabaseAdmin();
    const rows: {
      id: string;
      email: string | undefined;
      created_at: string | undefined;
      has_main_access: boolean;
      is_rf_admin: boolean;
    }[] = [];

    let page = 1;
    for (; page <= MAX_PAGES; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        console.error("[GET /api/admin/users]", error.message);
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      const users = data?.users ?? [];
      for (const u of users) {
        rows.push({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          has_main_access: u.app_metadata?.has_main_access === true,
          is_rf_admin: isRfAdmin(u.email),
        });
      }
      if (users.length < PER_PAGE) break;
    }

    rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[GET /api/admin/users]", e);
    return NextResponse.json({ error: "内部错误" }, { status: 500 });
  }
}
