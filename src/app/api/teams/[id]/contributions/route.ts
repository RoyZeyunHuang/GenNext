import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET — team contribution leaderboard */
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const teamId = params.id;

  // Check membership
  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "你不是该团队成员" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "all"; // week | month | all

  let query = supabase
    .from("team_contributions")
    .select("user_id, points, action, created_at")
    .eq("team_id", teamId);

  const now = new Date();
  if (period === "week") {
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1); // Monday
    weekStart.setUTCHours(0, 0, 0, 0);
    if (weekStart > now) weekStart.setUTCDate(weekStart.getUTCDate() - 7);
    query = query.gte("created_at", weekStart.toISOString());
  } else if (period === "month") {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    query = query.gte("created_at", monthStart.toISOString());
  }

  const { data: contributions, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by user
  const userMap = new Map<string, { total: number; breakdown: Record<string, number> }>();
  for (const c of contributions ?? []) {
    const uid = c.user_id as string;
    if (!userMap.has(uid)) userMap.set(uid, { total: 0, breakdown: {} });
    const entry = userMap.get(uid)!;
    entry.total += c.points as number;
    const action = c.action as string;
    entry.breakdown[action] = (entry.breakdown[action] || 0) + (c.points as number);
  }

  // Get emails
  const emailMap = new Map<string, string>();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = getSupabaseAdmin();
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    (usersData?.users ?? []).forEach((u) => {
      if (u.email) emailMap.set(u.id, u.email);
    });
  }

  const leaderboard = Array.from(userMap.entries())
    .map(([userId, data]) => ({
      user_id: userId,
      email: emailMap.get(userId) ?? "—",
      total_points: data.total,
      breakdown: data.breakdown,
    }))
    .sort((a, b) => b.total_points - a.total_points);

  return NextResponse.json({ leaderboard, period });
}
