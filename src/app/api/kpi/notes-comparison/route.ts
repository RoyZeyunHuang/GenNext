import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  fetchLatestRowsForPublishRange,
  noteRowKey,
  type LatestNoteInRangeRow,
} from "@/lib/kpi-latest-notes-in-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 避免 Vercel/代理缓存 GET，否则改库后前端仍看到旧的 avg_cover_ctr 等 */
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

function jsonRes(
  data: unknown,
  init?: { status?: number }
): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: NO_STORE_HEADERS,
  });
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

type NoteRow = LatestNoteInRangeRow;

function aggregate(rows: NoteRow[]) {
  const total_notes = rows.length;
  const total_exposure = rows.reduce((s, r) => s + toNum(r.exposure), 0);
  const total_views = rows.reduce((s, r) => s + toNum(r.views), 0);
  const total_interactions = rows.reduce(
    (s, r) =>
      s + toNum(r.likes) + toNum(r.comments) + toNum(r.collects) + toNum(r.shares),
    0
  );
  const total_follows = rows.reduce((s, r) => s + toNum(r.follows), 0);
  const total_collects = rows.reduce((s, r) => s + toNum(r.collects), 0);
  const weighted_cover_ctr = rows.reduce(
    (s, r) => s + toNum(r.exposure) * toNum(r.cover_ctr),
    0
  );
  const paid_count = rows.filter((r) => r.is_paid === true).length;
  const avg_interaction_rate = total_views > 0 ? total_interactions / total_views : 0;
  const avg_collect_rate = total_views > 0 ? total_collects / total_views : 0;
  const avg_cover_ctr = total_exposure > 0 ? weighted_cover_ctr / total_exposure : 0;
  const weighted_watch = rows.reduce(
    (s, r) => s + toNum(r.avg_watch_time) * toNum(r.views),
    0
  );
  const avg_watch_time = total_views > 0 ? weighted_watch / total_views : 0;
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
    avg_watch_time,
    paid_ratio,
  };
}

function metricChange(current: number, previous: number) {
  const change = current - previous;
  const change_rate = previous !== 0 ? change / previous : 0;
  return { change, change_rate };
}

/** YYYY-MM-DD 按日历加减整年（UTC，自动处理 2/29 等） */
function shiftCalendarDateByYears(ymd: string, deltaYears: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return ymd;
  }
  const u = new Date(Date.UTC(y, m - 1, d));
  u.setUTCFullYear(u.getUTCFullYear() + deltaYears);
  return u.toISOString().slice(0, 10);
}

function filterRowsByKeys(rows: NoteRow[], allowed: Set<string>): NoteRow[] {
  return rows.filter((r) => allowed.has(noteRowKey(r)));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from_date = searchParams.get("from_date");
  const to_date = searchParams.get("to_date");
  const accountNames = searchParams.getAll("account").filter(Boolean);
  const noteKeyParams = searchParams
    .getAll("note_key")
    .map((k) => k.trim())
    .filter(Boolean);
  const allowedKeys =
    noteKeyParams.length > 0 ? new Set(noteKeyParams) : null;

  if (!from_date || !to_date) {
    return jsonRes({ error: "from_date and to_date required" }, { status: 400 });
  }

  const noDataResponse = {
    start_date: null as string | null,
    end_date: null as string | null,
    current: null,
    previous: null,
    changes: null,
    trend: [] as unknown[],
    no_comparison: true,
  };

  let accountNoteIds: string[] | undefined;
  if (accountNames.length > 0) {
    const { data: paidRows } = await supabase
      .from("xhs_paid_daily")
      .select("note_id")
      .in("creator", accountNames)
      .not("note_id", "is", null);
    accountNoteIds = Array.from(
      new Set((paidRows ?? []).map((r) => r.note_id as string).filter(Boolean))
    );
    if (accountNoteIds.length === 0) return jsonRes(noDataResponse);
  }

  let currentRows = await fetchLatestRowsForPublishRange(
    from_date,
    to_date,
    accountNoteIds
  );
  if (allowedKeys) {
    currentRows = filterRowsByKeys(currentRows, allowedKeys);
  }
  if (currentRows.length === 0) return jsonRes(noDataResponse);

  const current = aggregate(currentRows);

  const byDate = new Map<string, NoteRow[]>();
  for (const row of currentRows) {
    const d = String(row.publish_date ?? row.snapshot_date ?? "").slice(0, 10);
    if (!d) continue;
    const list = byDate.get(d) ?? [];
    list.push(row);
    byDate.set(d, list);
  }
  const trend = Array.from(byDate.keys())
    .sort()
    .map((d) => {
      const a = aggregate(byDate.get(d) ?? []);
      return {
        date: d,
        exposure: a.total_exposure,
        interactions: a.total_interactions,
        interaction_rate: a.avg_interaction_rate,
      };
    });

  const prevFromDate = shiftCalendarDateByYears(from_date, -1);
  const prevToDate = shiftCalendarDateByYears(to_date, -1);

  let prevRows = await fetchLatestRowsForPublishRange(
    prevFromDate,
    prevToDate,
    accountNoteIds
  );
  if (allowedKeys) {
    prevRows = filterRowsByKeys(prevRows, allowedKeys);
  }
  const previous = aggregate(prevRows);
  const no_comparison = prevRows.length === 0;

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
    avg_watch_time: metricChange(
      current.avg_watch_time,
      previous.avg_watch_time
    ),
    paid_ratio: metricChange(current.paid_ratio, previous.paid_ratio),
  };

  return jsonRes({
    start_date: prevFromDate,
    end_date: prevToDate,
    current,
    previous: no_comparison ? null : previous,
    changes: no_comparison ? null : changes,
    trend,
    no_comparison,
  });
}
