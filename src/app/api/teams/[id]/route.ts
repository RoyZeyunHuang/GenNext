import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

async function requireTeamMember(teamId: string, userId: string) {
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** GET — team detail + members list */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const teamId = params.id;
  const membership = await requireTeamMember(teamId, session.userId);
  if (!membership) return NextResponse.json({ error: "你不是该团队成员" }, { status: 403 });

  const [teamRes, membersRes] = await Promise.all([
    supabase.from("teams").select("*").eq("id", teamId).single(),
    supabase
      .from("team_members")
      .select("id, user_id, role, joined_at")
      .eq("team_id", teamId)
      .order("joined_at", { ascending: true }),
  ]);

  if (teamRes.error) return NextResponse.json({ error: teamRes.error.message }, { status: 500 });

  // Fetch user emails for members
  const members = membersRes.data ?? [];
  let memberDetails = members;
  if (members.length > 0 && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = getSupabaseAdmin();
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    (usersData?.users ?? []).forEach((u) => {
      if (u.email) emailMap.set(u.id, u.email);
    });
    memberDetails = members.map((m) => ({
      ...m,
      email: emailMap.get(m.user_id) ?? "—",
    }));
  }

  return NextResponse.json({
    team: teamRes.data,
    members: memberDetails,
    my_role: membership.role,
  });
}

/** PATCH — update team name (owner/admin only) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const teamId = params.id;
  const membership = await requireTeamMember(teamId, session.userId);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "团队名称必填" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("teams")
    .update({ name })
    .eq("id", teamId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
