import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

type NoteRow = {
  snapshot_date: string;
  exposure?: unknown;
  views?: unknown;
  likes?: unknown;
  comments?: unknown;
  collects?: unknown;
  shares?: unknown;
  follows?: unknown;
  cover_ctr?: unknown;
  is_paid?: unknown;
};

function aggregate(rows: NoteRow[]) {
  const total_notes = rows.length;
  const total_exposure = rows.reduce((s, r) => s + toNum(r.exposure), 0);
  const total_views = rows.reduce((s, r) => s + toNum(r.views), 0);
  const total_interactions = rows.reduce(
    (s, r) =>
      s +
      toNum(r.likes) +
      toNum(r.comments) +
      toNum(r.collects) +
      toNum(r.shares),
    0
  );
  const total_follows = rows.reduce((s, r) => s + toNum(r.follows), 0);
  const total_collects = rows.reduce((s, r) => s + toNum(r.collects), 0);
  const weighted_cover_ctr = rows.reduce(
    (s, r) => s + toNum(r.exposure) * toNum(r.cover_ctr),
    0
  );
  const paid_count = rows.filter((r) => r.is_paid === true).length;

  const avg_interaction_rate =
    total_views > 0 ? total_interactions / total_views : 0;
  const avg_collect_rate = total_views > 0 ? total_collects / total_views : 0;
  const avg_cover_ctr =
    total_exposure > 0 ? weighted_cover_ctr / total_exposure : 0;
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

function metricChange(current: number, previous: number) {
  const change = current - previous;
  const change_rate = previous !== 0 ? change / previous : 0;
  return { change, change_rate };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from_date = searchParams.get("from_date");
  const to_date = searchParams.get("to_date");
  const accountNames = searchParams.getAll("account").filter(Boolean);
  if (!from_date || !to_date) {
    return NextResponse.json(
      { error: "from_date and to_date required" },
      { status: 400 }
    );
  }

  let noteIdsFilter: string[] | null = null;
  if (accountNames.length > 0) {
    const { data: paidRows } = await supabase
      .from("xhs_paid_daily")
      .select("note_id")
      .in("creator", accountNames)
      .not("note_id", "is", null);
    noteIdsFilter = Array.from(new Set((paidRows ?? []).map((r) => r.note_id as string).filter(Boolean)));
    if (noteIdsFilter.length === 0) {
      return NextResponse.json({
        start_date: null,
        end_date: null,
        current: null,
        previous: null,
        changes: null,
        trend: [],
        no_comparison: true,
      });
    }
  }

  let query = supabase
    .from("xhs_notes_with_publish_date")
    .select(
      "snapshot_date, exposure, views, likes, comments, collects, shares, follows, cover_ctr, is_paid"
    )
    .gte("snapshot_date", from_date)
    .lte("snapshot_date", to_date)
    .gte("publish_date", from_date)
    .lte("publish_date", to_date)
    .order("snapshot_date", { ascending: true });
  if (noteIdsFilter && noteIdsFilter.length > 0) {
    query = query.in("note_id", noteIdsFilter);
  }
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as NoteRow[];
  const dates = Array.from(new Set(rows.map((r) => String(r.snapshot_date).slice(0, 10))));
  if (dates.length === 0) {
    return NextResponse.json({
      start_date: null,
      end_date: null,
      current: null,
      previous: null,
      changes: null,
      trend: [],
      no_comparison: true,
    });
  }

  const start_date = dates[0];
  const end_date = dates[dates.length - 1];
  const no_comparison = start_date === end_date;

  const rowsByDate = new Map<string, NoteRow[]>();
  for (const r of rows) {
    const d = String(r.snapshot_date).slice(0, 10);
    const list = rowsByDate.get(d) ?? [];
    list.push(r);
    rowsByDate.set(d, list);
  }

  const previous = aggregate(rowsByDate.get(start_date) ?? []);
  const current = aggregate(rowsByDate.get(end_date) ?? []);

  const changes = {
    total_notes: metricChange(current.total_notes, previous.total_notes),
    total_exposure: metricChange(current.total_exposure, previous.total_exposure),
    total_views: metricChange(current.total_views, previous.total_views),
    total_interactions: metricChange(
      current.total_interactions,
      previous.total_interactions
    ),
    total_follows: metricChange(current.total_follows, previous.total_follows),
    avg_interaction_rate: metricChange(
      current.avg_interaction_rate,
      previous.avg_interaction_rate
    ),
    avg_collect_rate: metricChange(
      current.avg_collect_rate,
      previous.avg_collect_rate
    ),
    avg_cover_ctr: metricChange(current.avg_cover_ctr, previous.avg_cover_ctr),
    follow_efficiency: metricChange(
      current.follow_efficiency,
      previous.follow_efficiency
    ),
    paid_ratio: metricChange(current.paid_ratio, previous.paid_ratio),
  };

  const trend = dates.map((d) => {
    const a = aggregate(rowsByDate.get(d) ?? []);
    return {
      date: d,
      exposure: a.total_exposure,
      interactions: a.total_interactions,
      interaction_rate: a.avg_interaction_rate,
    };
  });

  return NextResponse.json({
    start_date,
    end_date,
    current,
    previous,
    changes,
    trend,
    no_comparison,
  });
}
