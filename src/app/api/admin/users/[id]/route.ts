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
  const hasMain =
    typeof body.has_main_access === "boolean" ? body.has_main_access : undefined;
  const personaUnlimited =
    typeof body.persona_generate_unlimited === "boolean"
      ? body.persona_generate_unlimited
      : undefined;
  const rfApproved =
    typeof body.rf_approved === "boolean" ? body.rf_approved : undefined;

  if (hasMain === undefined && personaUnlimited === undefined && rfApproved === undefined) {
    return NextResponse.json(
      { error: "请提供 has_main_access、persona_generate_unlimited 或 rf_approved（布尔值）" },
      { status: 400 }
    );
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

    const nextMeta = { ...prevMeta };
    if (hasMain !== undefined) nextMeta.has_main_access = hasMain;
    if (personaUnlimited !== undefined) nextMeta.persona_generate_unlimited = personaUnlimited;
    if (rfApproved !== undefined) nextMeta.rf_approved = rfApproved;

    const { data: updated, error: ue } = await admin.auth.admin.updateUserById(id, {
      app_metadata: nextMeta,
    });

    if (ue) {
      return NextResponse.json({ error: ue.message }, { status: 502 });
    }

    return NextResponse.json({
      id: updated.user?.id,
      email: updated.user?.email,
      has_main_access: updated.user?.app_metadata?.has_main_access === true,
      persona_generate_unlimited:
        updated.user?.app_metadata?.persona_generate_unlimited === true,
      rf_approved: updated.user?.app_metadata?.rf_approved === true,
    });
  } catch (e) {
    console.error("[PATCH /api/admin/users/[id]]", e);
    return NextResponse.json({ error: "内部错误" }, { status: 500 });
  }
}
