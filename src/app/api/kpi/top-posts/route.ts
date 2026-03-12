import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "organic";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const limit = parseInt(sp.get("limit") ?? "5");
  const ae = sp.get("ae") ?? "";
  const building = sp.get("building") ?? "";
  const allPosts = sp.get("all") === "1";

  try {
    let filteredKeys: Set<string> | null = null;
    if (ae || building) {
      let aq = supabase.from("post_attributes").select("post_key");
      if (ae) aq = aq.eq("ae", ae);
      if (building) aq = aq.eq("building", building);
      const { data: attrs } = await aq;
      filteredKeys = new Set((attrs ?? []).map((r: { post_key: string }) => r.post_key));
    }

    if (type === "organic") {
      const { data: paidKeys } = await supabase.from("paid_metrics_daily").select("post_key");
      const paidSet = new Set((paidKeys ?? []).map((r: { post_key: string }) => r.post_key));

      let q = supabase.from("xhs_post_metrics_snapshots").select("post_key, snapshot_date, exposure, views, cover_ctr, likes, comments, collects, follows, shares");
      if (from) q = q.gte("snapshot_date", from);
      if (to) q = q.lte("snapshot_date", to);
      const { data: snaps } = await q;

      const latest = new Map<string, Record<string, unknown>>();
      for (const s of snaps ?? []) {
        if (paidSet.has(s.post_key)) continue;
        if (filteredKeys && !filteredKeys.has(s.post_key)) continue;
        const ex = latest.get(s.post_key) as { snapshot_date: string } | undefined;
        if (!ex || s.snapshot_date > ex.snapshot_date) latest.set(s.post_key, s);
      }

      const sorted = Array.from(latest.values())
        .map((r: Record<string, unknown>) => {
          const exp = (r.exposure as number) ?? 0;
          const eng = ((r.likes as number) ?? 0) + ((r.comments as number) ?? 0) + ((r.collects as number) ?? 0) + ((r.shares as number) ?? 0);
          return { ...r, engagementRate: exp > 0 ? Math.round((eng / exp) * 10000) / 100 : 0 } as Record<string, unknown>;
        })
        .sort((a, b) => ((b.exposure as number) ?? 0) - ((a.exposure as number) ?? 0));

      const result = allPosts ? sorted : sorted.slice(0, limit);

      const postKeys = result.map((r) => r.post_key as string);
      const { data: posts } = await supabase.from("core_posts").select("post_key, title, cover_url, publish_time").in("post_key", postKeys.length > 0 ? postKeys : ["__none__"]);
      const postMap = new Map((posts ?? []).map((p) => [p.post_key, p]));

      return Response.json(result.map((r) => {
        const p = postMap.get(r.post_key as string);
        return { ...r, title: p?.title ?? "", cover_url: p?.cover_url ?? "", publish_time: p?.publish_time ?? "" };
      }));
    }

    if (type === "paid") {
      let q = supabase.from("paid_metrics_daily").select("post_key, event_date, impressions, spend, ctr, interactions, dm_in, dm_open, dm_lead, dm_in_cost, dm_lead_cost");
      if (from) q = q.gte("event_date", from);
      if (to) q = q.lte("event_date", to);
      const { data: rows } = await q;

      const agg = new Map<string, { impressions: number; spend: number; ctr: number; interactions: number; dm_in: number; dm_lead: number; count: number }>();
      for (const r of rows ?? []) {
        if (filteredKeys && !filteredKeys.has(r.post_key)) continue;
        const e = agg.get(r.post_key) ?? { impressions: 0, spend: 0, ctr: 0, interactions: 0, dm_in: 0, dm_lead: 0, count: 0 };
        e.impressions += r.impressions ?? 0;
        e.spend += r.spend ?? 0;
        e.ctr += r.ctr ?? 0;
        e.interactions += r.interactions ?? 0;
        e.dm_in += r.dm_in ?? 0;
        e.dm_lead += r.dm_lead ?? 0;
        e.count++;
        agg.set(r.post_key, e);
      }

      const sorted = Array.from(agg.entries())
        .map(([post_key, v]) => ({ post_key, impressions: v.impressions, spend: Math.round(v.spend * 100) / 100, ctr: Math.round((v.ctr / v.count) * 100) / 100, interactions: v.interactions, dm_in: v.dm_in, dm_lead: v.dm_lead, costPerDm: v.dm_in > 0 ? Math.round((v.spend / v.dm_in) * 100) / 100 : 0, costPerLead: v.dm_lead > 0 ? Math.round((v.spend / v.dm_lead) * 100) / 100 : 0 }))
        .sort((a, b) => b.impressions - a.impressions);

      const result = allPosts ? sorted : sorted.slice(0, limit);
      const postKeys = result.map((r) => r.post_key);
      const { data: posts } = await supabase.from("core_posts").select("post_key, title, cover_url, publish_time").in("post_key", postKeys.length > 0 ? postKeys : ["__none__"]);
      const postMap = new Map((posts ?? []).map((p) => [p.post_key, p]));

      return Response.json(result.map((r) => {
        const p = postMap.get(r.post_key);
        return { ...r, title: p?.title ?? "", cover_url: p?.cover_url ?? "", publish_time: p?.publish_time ?? "" };
      }));
    }

    if (type === "ig") {
      let q = supabase.from("ig_post_metrics_snapshots").select("post_key, snapshot_date, views, reach, likes, comments, saves, shares, follows");
      if (from) q = q.gte("snapshot_date", from);
      if (to) q = q.lte("snapshot_date", to);
      const { data: snaps } = await q;

      const latest = new Map<string, Record<string, unknown>>();
      for (const s of snaps ?? []) {
        const ex = latest.get(s.post_key) as { snapshot_date: string } | undefined;
        if (!ex || s.snapshot_date > ex.snapshot_date) latest.set(s.post_key, s);
      }

      const sorted = Array.from(latest.values())
        .map((r) => {
          const reach = (r.reach as number) ?? 0;
          const eng = ((r.likes as number) ?? 0) + ((r.comments as number) ?? 0) + ((r.saves as number) ?? 0) + ((r.shares as number) ?? 0);
          return { ...r, engagementRate: reach > 0 ? Math.round((eng / reach) * 10000) / 100 : 0 } as Record<string, unknown>;
        })
        .sort((a, b) => ((b.views as number) ?? 0) - ((a.views as number) ?? 0));

      const result = allPosts ? sorted : sorted.slice(0, limit);
      const postKeys = result.map((r) => r.post_key as string);
      const { data: posts } = await supabase.from("core_ig_posts").select("post_key, description, permalink, publish_time").in("post_key", postKeys.length > 0 ? postKeys : ["__none__"]);
      const postMap = new Map((posts ?? []).map((p) => [p.post_key, p]));

      return Response.json(result.map((r) => {
        const p = postMap.get(r.post_key as string);
        return { ...r, title: p?.description?.slice(0, 80) ?? "", permalink: p?.permalink ?? "", publish_time: p?.publish_time ?? "" };
      }));
    }

    return Response.json([]);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
