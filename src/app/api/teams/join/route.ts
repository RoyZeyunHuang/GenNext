import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — join a team via invite code */
export async function POST(req: NextRequest) {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body.invite_code === "string" ? body.invite_code.trim() : "";
  if (!code) return NextResponse.json({ error: "请输入邀请码" }, { status: 400 });

  // Find team by invite code
  const { data: team, error: te } = await supabase
    .from("teams")
    .select("id, name")
    .eq("invite_code", code)
    .maybeSingle();

  if (te) return NextResponse.json({ error: te.message }, { status: 500 });
  if (!team) return NextResponse.json({ error: "邀请码无效" }, { status: 404 });

  // Check if already a member
  const { data: existing } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", team.id)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "你已经是该团队成员" }, { status: 409 });
  }

  const admin = getSupabaseAdmin();
  const { error: me } = await admin
    .from("team_members")
    .insert({ team_id: team.id, user_id: session.userId, role: "member" });

  if (me) return NextResponse.json({ error: me.message }, { status: 500 });

  return NextResponse.json({ team_id: team.id, team_name: team.name });
}
