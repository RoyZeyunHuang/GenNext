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
    let q = supabase.from("paid_metrics_daily").select("post_key, impressions, spend, ctr, interactions, dm_in, dm_open, dm_lead, dm_in_cost, dm_lead_cost");
    if (from) q = q.gte("event_date", from);
    if (to) q = q.lte("event_date", to);
    const { data: rows } = await q;

    let filteredKeys: Set<string> | null = null;
    if (ae || building) {
      let aq = supabase.from("post_attributes").select("post_key");
      if (ae) aq = aq.eq("ae", ae);
      if (building) aq = aq.eq("building", building);
      const { data: attrs } = await aq;
      filteredKeys = new Set((attrs ?? []).map((r: { post_key: string }) => r.post_key));
    }

    const filtered = (rows ?? []).filter((r) => !filteredKeys || filteredKeys.has(r.post_key));
    const postKeys = new Set(filtered.map((r) => r.post_key));
    const postCount = postKeys.size;
    const totalImpressions = filtered.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const totalSpend = filtered.reduce((s, r) => s + (r.spend ?? 0), 0);
    const totalInteractions = filtered.reduce((s, r) => s + (r.interactions ?? 0), 0);
    const totalDmIn = filtered.reduce((s, r) => s + (r.dm_in ?? 0), 0);
    const totalDmLead = filtered.reduce((s, r) => s + (r.dm_lead ?? 0), 0);
    const avgCtr = filtered.length > 0 ? filtered.reduce((s, r) => s + (r.ctr ?? 0), 0) / filtered.length : 0;
    const costPerDm = totalDmIn > 0 ? totalSpend / totalDmIn : 0;
    const costPerLead = totalDmLead > 0 ? totalSpend / totalDmLead : 0;

    return Response.json({
      postCount,
      totalImpressions,
      totalSpend: Math.round(totalSpend * 100) / 100,
      avgCtr: Math.round(avgCtr * 100) / 100,
      totalInteractions,
      totalDmIn,
      totalDmLead,
      costPerDm: Math.round(costPerDm * 100) / 100,
      costPerLead: Math.round(costPerLead * 100) / 100,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
