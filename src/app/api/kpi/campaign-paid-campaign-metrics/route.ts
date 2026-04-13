import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
} as const;

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type PaidCampaignTrendPoint = {
  date: string;
  exposure: number;
  interactions: number;
  interaction_rate: number;
};

/**
 * 投放 Campaign：在日期范围内按所选 note_id（或全部）汇总 xhs_paid_daily。
 * 平均点击率 = 按展现加权的 ctr；含按日 trend（与全量笔记趋势图字段对齐）。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const noteIds = sp.getAll("note_id").map((s) => s.trim()).filter(Boolean);
  const allPaidInRange = sp.get("all_paid_in_range") === "1";

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to required" },
      { status: 400, headers: NO_STORE }
    );
  }

  let q = supabase
    .from("xhs_paid_daily")
    .select(
      "note_id, event_date, spend, impressions, interactions, completion_5s, ctr"
    )
    .gte("event_date", from)
    .lte("event_date", to)
    .not("note_id", "is", null);

  if (noteIds.length > 0) {
    q = q.in("note_id", noteIds);
  } else if (!allPaidInRange) {
    return NextResponse.json(
      {
        error: "note_id params or all_paid_in_range=1 required",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_STORE }
    );
  }

  let spend = 0;
  let impressions = 0;
  let interactions = 0;
  let weightedCompNumerator = 0;
  let weightedCtrNumerator = 0;
  const distinctNotes = new Set<string>();

  const byDate = new Map<
    string,
    { impressions: number; interactions: number }
  >();

  for (const row of data ?? []) {
    const nid = row.note_id != null ? String(row.note_id).trim() : "";
    if (nid) distinctNotes.add(nid);
    spend += toNum(row.spend);
    const impr = toNum(row.impressions);
    impressions += impr;
    interactions += toNum(row.interactions);
    const ctrVal = row.ctr;
    const ctr =
      ctrVal === null || ctrVal === undefined || ctrVal === ""
        ? 0
        : toNum(ctrVal);
    weightedCtrNumerator += ctr * impr;
    const comp = row.completion_5s;
    const c =
      comp === null || comp === undefined || comp === ""
        ? 0
        : toNum(comp);
    weightedCompNumerator += c * impr;

    const d = String(row.event_date ?? "").slice(0, 10);
    if (d) {
      const prev = byDate.get(d) ?? { impressions: 0, interactions: 0 };
      prev.impressions += impr;
      prev.interactions += toNum(row.interactions);
      byDate.set(d, prev);
    }
  }

  const completion_5s_rate =
    impressions > 0 ? weightedCompNumerator / impressions : 0;

  const avg_ctr =
    impressions > 0 ? weightedCtrNumerator / impressions : 0;

  const trend: PaidCampaignTrendPoint[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => ({
      date,
      exposure: a.impressions,
      interactions: a.interactions,
      interaction_rate:
        a.impressions > 0 ? a.interactions / a.impressions : 0,
    }));

  return NextResponse.json(
    {
      spend: Math.round(spend * 100) / 100,
      note_count: distinctNotes.size,
      impressions,
      interactions,
      completion_5s_rate: Math.round(completion_5s_rate * 1000000) / 1000000,
      avg_ctr: Math.round(avg_ctr * 1000000) / 1000000,
      trend,
    },
    { headers: NO_STORE }
  );
}
