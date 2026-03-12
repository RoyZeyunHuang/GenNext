import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const ae = sp.get("ae") ?? "";
  const building = sp.get("building") ?? "";

  try {
    // Get paid post_keys to exclude
    const { data: paidKeys } = await supabase.from("paid_metrics_daily").select("post_key");
    const paidSet = new Set((paidKeys ?? []).map((r: { post_key: string }) => r.post_key));

    // Get latest snapshot per post
    let q = supabase.from("xhs_post_metrics_snapshots").select("post_key, snapshot_date, exposure, views, cover_ctr, likes, comments, collects, follows, shares");
    if (from) q = q.gte("snapshot_date", from);
    if (to) q = q.lte("snapshot_date", to);
    const { data: snapshots } = await q;

    let filteredKeys: Set<string> | null = null;
    if (ae || building) {
      let aq = supabase.from("post_attributes").select("post_key");
      if (ae) aq = aq.eq("ae", ae);
      if (building) aq = aq.eq("building", building);
      const { data: attrs } = await aq;
      filteredKeys = new Set((attrs ?? []).map((r: { post_key: string }) => r.post_key));
    }

    // Get latest snapshot per post_key
    const latest = new Map<string, (typeof snapshots extends (infer T)[] | null ? T : never)>();
    for (const s of snapshots ?? []) {
      if (paidSet.has(s.post_key)) continue;
      if (filteredKeys && !filteredKeys.has(s.post_key)) continue;
      const existing = latest.get(s.post_key);
      if (!existing || s.snapshot_date > existing.snapshot_date) {
        latest.set(s.post_key, s);
      }
    }

    const rows = Array.from(latest.values());
    const postCount = rows.length;
    const totalExposure = rows.reduce((s, r) => s + (r.exposure ?? 0), 0);
    const totalEngagement = rows.reduce((s, r) => s + (r.likes ?? 0) + (r.comments ?? 0) + (r.collects ?? 0) + (r.shares ?? 0), 0);
    const avgEngagementRate = totalExposure > 0 ? totalEngagement / totalExposure : 0;

    let weightedCtr = 0;
    if (totalExposure > 0) {
      weightedCtr = rows.reduce((s, r) => s + (r.cover_ctr ?? 0) * (r.exposure ?? 0), 0) / totalExposure;
    }

    return Response.json({
      postCount,
      totalExposure,
      avgEngagementRate: Math.round(avgEngagementRate * 10000) / 100,
      avgCoverCtr: Math.round(weightedCtr * 100) / 100,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
