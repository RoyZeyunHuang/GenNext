import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  try {
    let q = supabase.from("ig_post_metrics_snapshots").select("post_key, snapshot_date, views, reach, likes, comments, saves, shares, follows");
    if (from) q = q.gte("snapshot_date", from);
    if (to) q = q.lte("snapshot_date", to);
    const { data: snapshots } = await q;

    const latest = new Map<string, (typeof snapshots extends (infer T)[] | null ? T : never)>();
    for (const s of snapshots ?? []) {
      const existing = latest.get(s.post_key);
      if (!existing || s.snapshot_date > existing.snapshot_date) latest.set(s.post_key, s);
    }

    const rows = Array.from(latest.values());
    const postCount = rows.length;
    const totalViews = rows.reduce((s, r) => s + (r.views ?? 0), 0);
    const totalReach = rows.reduce((s, r) => s + (r.reach ?? 0), 0);
    const totalEng = rows.reduce((s, r) => s + (r.likes ?? 0) + (r.comments ?? 0) + (r.saves ?? 0) + (r.shares ?? 0), 0);
    const avgEngRate = totalReach > 0 ? totalEng / totalReach : 0;

    return Response.json({
      postCount,
      totalViews,
      totalReach,
      avgEngagementRate: Math.round(avgEngRate * 10000) / 100,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
