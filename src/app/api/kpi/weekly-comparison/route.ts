import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function aggregate(list: { exposure?: unknown; views?: unknown; likes?: unknown; comments?: unknown; collects?: unknown; shares?: unknown; follows?: unknown; cover_ctr?: unknown; is_paid?: unknown }[]) {
  const total_notes = list.length;
  const total_exposure = list.reduce((s, r) => s + Number(r.exposure || 0), 0);
  const total_views = list.reduce((s, r) => s + Number(r.views || 0), 0);
  const total_interactions = list.reduce(
    (s, r) => s + toNum(r.likes) + toNum(r.comments) + toNum(r.collects) + toNum(r.shares),
    0
  );
  const total_follows = list.reduce((s, r) => s + toNum(r.follows), 0);
  const total_collects = list.reduce((s, r) => s + toNum(r.collects), 0);
  const exposure_weighted_ctr = list.reduce((s, r) => s + Number(r.exposure || 0) * toNum(r.cover_ctr), 0);
  const paid_count = list.filter((r) => r.is_paid === true).length;
  const avg_interaction_rate = total_views > 0 ? total_interactions / total_views : 0;
  const avg_collect_rate = total_views > 0 ? total_collects / total_views : 0;
  const avg_cover_ctr = total_exposure > 0 ? exposure_weighted_ctr / total_exposure : 0;
  const follow_efficiency = total_views > 0 ? total_follows / total_views : 0;
  const paid_ratio = total_notes > 0 ? paid_count / total_notes : 0;
  return {
    total_notes,
    total_exposure,
    total_views,
    total_interactions,
    total_follows,
    avg_interaction_rate,
    avg_collect_rate,
    avg_cover_ctr,
    follow_efficiency,
    paid_ratio,
  };
}

function toMetric(prev: number, curr: number) {
  const change = curr - prev;
  const change_rate = prev !== 0 ? change / prev : 0;
  return { current: curr, previous: prev, change, change_rate };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const _current_date = searchParams.get("current_date"); // 预留，当前逻辑不依赖

  const { data: dateRows, error: dateError } = await supabase
    .from("xhs_notes")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false });

  if (dateError) {
    return NextResponse.json({ error: dateError.message }, { status: 500 });
  }

  const uniqueDates = [...new Set((dateRows ?? []).map((r) => String(r.snapshot_date).slice(0, 10)))];
  const this_week_date = uniqueDates[0] ?? null;
  const last_week_date = uniqueDates[1] ?? null;

  if (!this_week_date || !last_week_date) {
    let thisWeekAgg: ReturnType<typeof aggregate> | null = null;
    if (this_week_date) {
      const { data: rows } = await supabase
        .from("xhs_notes")
        .select("*")
        .eq("snapshot_date", this_week_date);
      thisWeekAgg = aggregate(rows ?? []);
    }
    const emptyMetric = (c: number) => ({ current: c, previous: 0, change: c, change_rate: 0 });
    return NextResponse.json({
      this_week_date: this_week_date ?? null,
      last_week_date: null,
      metrics: thisWeekAgg
        ? {
            total_notes: emptyMetric(thisWeekAgg.total_notes),
            total_exposure: emptyMetric(thisWeekAgg.total_exposure),
            total_views: emptyMetric(thisWeekAgg.total_views),
            total_interactions: emptyMetric(thisWeekAgg.total_interactions),
            total_follows: emptyMetric(thisWeekAgg.total_follows),
            avg_interaction_rate: emptyMetric(thisWeekAgg.avg_interaction_rate),
            avg_collect_rate: emptyMetric(thisWeekAgg.avg_collect_rate),
            avg_cover_ctr: emptyMetric(thisWeekAgg.avg_cover_ctr),
            follow_efficiency: emptyMetric(thisWeekAgg.follow_efficiency),
            paid_ratio: emptyMetric(thisWeekAgg.paid_ratio),
          }
        : null,
      no_comparison: true,
    });
  }

  const { data: thisRows, error: thisErr } = await supabase
    .from("xhs_notes")
    .select("*")
    .eq("snapshot_date", this_week_date);
  const { data: lastRows, error: lastErr } = await supabase
    .from("xhs_notes")
    .select("*")
    .eq("snapshot_date", last_week_date);

  if (thisErr || lastErr) {
    return NextResponse.json(
      { error: thisErr?.message ?? lastErr?.message },
      { status: 500 }
    );
  }

  const thisAgg = aggregate(thisRows ?? []);
  const lastAgg = aggregate(lastRows ?? []);

  const metrics = {
    total_notes: toMetric(lastAgg.total_notes, thisAgg.total_notes),
    total_exposure: toMetric(lastAgg.total_exposure, thisAgg.total_exposure),
    total_views: toMetric(lastAgg.total_views, thisAgg.total_views),
    total_interactions: toMetric(lastAgg.total_interactions, thisAgg.total_interactions),
    total_follows: toMetric(lastAgg.total_follows, thisAgg.total_follows),
    avg_interaction_rate: toMetric(lastAgg.avg_interaction_rate, thisAgg.avg_interaction_rate),
    avg_collect_rate: toMetric(lastAgg.avg_collect_rate, thisAgg.avg_collect_rate),
    avg_cover_ctr: toMetric(lastAgg.avg_cover_ctr, thisAgg.avg_cover_ctr),
    follow_efficiency: toMetric(lastAgg.follow_efficiency, thisAgg.follow_efficiency),
    paid_ratio: toMetric(lastAgg.paid_ratio, thisAgg.paid_ratio),
  };

  return NextResponse.json({
    this_week_date,
    last_week_date,
    metrics,
    no_comparison: false,
  });
}
