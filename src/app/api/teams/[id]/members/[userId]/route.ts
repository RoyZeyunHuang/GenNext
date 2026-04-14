import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; userId: string } };

/** DELETE — remove a member (owner/admin can remove others, anyone can leave) */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const teamId = params.id;
  const targetUserId = params.userId;

  // Get caller's membership
  const { data: callerMembership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!callerMembership) {
    return NextResponse.json({ error: "你不是该团队成员" }, { status: 403 });
  }

  // Self-leave
  if (targetUserId === session.userId) {
    if (callerMembership.role === "owner") {
      return NextResponse.json({ error: "团队创建者不能退出团队" }, { status: 400 });
    }
    const admin = getSupabaseAdmin();
    await admin
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", session.userId);
    return NextResponse.json({ ok: true });
  }

  // Remove others — requires owner or admin
  if (!["owner", "admin"].includes(callerMembership.role)) {
    return NextResponse.json({ error: "无权限移除成员" }, { status: 403 });
  }

  // Can't remove owner
  const { data: targetMembership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!targetMembership) {
    return NextResponse.json({ error: "该用户不在团队中" }, { status: 404 });
  }
  if (targetMembership.role === "owner") {
    return NextResponse.json({ error: "不能移除团队创建者" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  await admin
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", targetUserId);

  return NextResponse.json({ ok: true });
}
