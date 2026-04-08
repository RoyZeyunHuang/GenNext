import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireRfAdmin } from "@/lib/require-rf-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRfAdmin();
  if (!gate.ok) return gate.response;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.has_main_access !== "boolean") {
    return NextResponse.json({ error: "has_main_access 须为布尔值" }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: current, error: ge } = await admin.auth.admin.getUserById(id);
    if (ge || !current?.user) {
      return NextResponse.json({ error: ge?.message ?? "用户不存在" }, { status: 404 });
    }

    const prevMeta =
      current.user.app_metadata && typeof current.user.app_metadata === "object"
        ? { ...current.user.app_metadata }
        : {};

    const { data: updated, error: ue } = await admin.auth.admin.updateUserById(id, {
      app_metadata: {
        ...prevMeta,
        has_main_access: body.has_main_access,
      },
    });

    if (ue) {
      return NextResponse.json({ error: ue.message }, { status: 502 });
    }

    return NextResponse.json({
      id: updated.user?.id,
      email: updated.user?.email,
      has_main_access: updated.user?.app_metadata?.has_main_access === true,
    });
  } catch (e) {
    console.error("[PATCH /api/admin/users/[id]]", e);
    return NextResponse.json({ error: "内部错误" }, { status: 500 });
  }
}
