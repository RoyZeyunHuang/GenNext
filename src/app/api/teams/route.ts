import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — list teams the current user belongs to */
export async function GET() {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { data: memberships, error } = await supabase
    .from("team_members")
    .select("team_id, role, joined_at, teams(id, name, invite_code, created_by, created_at)")
    .eq("user_id", session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teams = (memberships ?? []).map((m) => {
    const t = m.teams as unknown as { id: string; name: string; invite_code: string; created_by: string; created_at: string };
    return {
      id: t.id,
      name: t.name,
      invite_code: t.invite_code,
      created_by: t.created_by,
      created_at: t.created_at,
      my_role: m.role,
      joined_at: m.joined_at,
    };
  });

  return NextResponse.json(teams);
}

/** POST — create a new team */
export async function POST(req: NextRequest) {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "团队名称必填" }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Create team
  const { data: team, error: te } = await admin
    .from("teams")
    .insert({ name, created_by: session.userId })
    .select()
    .single();
  if (te) return NextResponse.json({ error: te.message }, { status: 500 });

  // Add creator as owner
  const { error: me } = await admin
    .from("team_members")
    .insert({ team_id: team.id, user_id: session.userId, role: "owner" });
  if (me) return NextResponse.json({ error: me.message }, { status: 500 });

  return NextResponse.json({ ...team, my_role: "owner" });
}
