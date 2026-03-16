import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export async function GET() {
  const { data: dateRows, error: dateError } = await supabase
    .from("xhs_notes")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: true });

  if (dateError) {
    return NextResponse.json({ error: dateError.message }, { status: 500 });
  }

  const dates = [...new Set((dateRows ?? []).map((r) => String(r.snapshot_date).slice(0, 10)))];
  const result: { snapshot_date: string; total_exposure: number; total_interactions: number; avg_interaction_rate: number }[] = [];

  for (const d of dates) {
    const { data: rows, error } = await supabase
      .from("xhs_notes")
      .select("exposure, views, likes, comments, collects, shares")
      .eq("snapshot_date", d);
    if (error) continue;
    const list = rows ?? [];
    const total_exposure = list.reduce((s, r) => s + Number(r.exposure || 0), 0);
    const total_views = list.reduce((s, r) => s + Number(r.views || 0), 0);
    const total_interactions = list.reduce(
      (s, r) =>
        s + toNum(r.likes) + toNum(r.comments) + toNum(r.collects) + toNum(r.shares),
      0
    );
    const avg_interaction_rate = total_views > 0 ? total_interactions / total_views : 0;
    result.push({
      snapshot_date: d,
      total_exposure,
      total_interactions,
      avg_interaction_rate,
    });
  }

  return NextResponse.json({ data: result });
}
