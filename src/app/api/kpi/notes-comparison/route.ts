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
  note_id?: string;
  publish_date?: string;
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

/**
 * 找出 publish_date 在 [from, to] 范围内的去重 note_id 列表
 */
async function fetchNoteIdsInPublishRange(
  from: string,
  to: string,
  allowedIds?: string[]
): Promise<string[]> {
  let q = supabase
    .from("xhs_notes_with_publish_date")
    .select("note_id")
    .gte("publish_date", from)
    .lte("publish_date", to)
    .not("note_id", "is", null);
  if (allowedIds && allowedIds.length > 0) {
    q = q.in("note_id", allowedIds);
  }
  const { data } = await q;
  return Array.from(
    new Set((data ?? []).map((r: { note_id: string }) => r.note_id).filter(Boolean))
  );
}

/**
 * 对 noteIds 中每个笔记取最新快照行，返回汇总用的行数组
 */
async function fetchLatestSnapshotRows(noteIds: string[]): Promise<NoteRow[]> {
  if (noteIds.length === 0) return [];
  const { data, error } = await supabase
    .from("xhs_notes_with_publish_date")
    .select(
      "note_id, publish_date, snapshot_date, exposure, views, likes, comments, collects, shares, follows, cover_ctr, is_paid"
    )
    .in("note_id", noteIds);
  if (error || !data) return [];
  // 每个 note_id 保留 snapshot_date 最大的那行
  const latestByNote = new Map<string, NoteRow>();
  for (const row of data as NoteRow[]) {
    const nid = row.note_id ?? "";
    if (!nid) continue;
    const existing = latestByNote.get(nid);
    if (!existing || String(row.snapshot_date) > String(existing.snapshot_date)) {
      latestByNote.set(nid, row);
    }
  }
  return Array.from(latestByNote.values());
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

  const noDataResponse = {
    start_date: null as string | null,
    end_date: null as string | null,
    current: null,
    previous: null,
    changes: null,
    trend: [] as unknown[],
    no_comparison: true,
  };

  // 账号过滤：拿到该账号下的 note_id 集合
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
    if (accountNoteIds.length === 0) return NextResponse.json(noDataResponse);
  }

  // ① 当前期：publish_date 在 [from, to] 的笔记，取各笔记最新快照
  const currentNoteIds = await fetchNoteIdsInPublishRange(
    from_date,
    to_date,
    accountNoteIds
  );
  if (currentNoteIds.length === 0) return NextResponse.json(noDataResponse);

  const currentRows = await fetchLatestSnapshotRows(currentNoteIds);
  const current = aggregate(currentRows);

  // 趋势：按 publish_date 分组（每天发布的笔记，以最新快照指标汇总）
  const byPublishDate = new Map<string, NoteRow[]>();
  for (const row of currentRows) {
    const pd = String(row.publish_date ?? "").slice(0, 10);
    if (!pd) continue;
    const list = byPublishDate.get(pd) ?? [];
    list.push(row);
    byPublishDate.set(pd, list);
  }
  const trend = Array.from(byPublishDate.keys())
    .sort()
    .map((d) => {
      const a = aggregate(byPublishDate.get(d) ?? []);
      return {
        date: d,
        exposure: a.total_exposure,
        interactions: a.total_interactions,
        interaction_rate: a.avg_interaction_rate,
      };
    });

  // ② 对比期：往前推同等天数
  const fromMs = new Date(from_date).getTime();
  const toMs = new Date(to_date).getTime();
  const durationDays = Math.max(1, Math.round((toMs - fromMs) / 86400000));
  const prevToDate = new Date(fromMs - 86400000).toISOString().slice(0, 10);
  const prevFromDate = new Date(
    fromMs - 86400000 - durationDays * 86400000
  ).toISOString().slice(0, 10);

  const prevNoteIds = await fetchNoteIdsInPublishRange(
    prevFromDate,
    prevToDate,
    accountNoteIds
  );
  const prevRows = await fetchLatestSnapshotRows(prevNoteIds);
  const previous = aggregate(prevRows);
  const no_comparison = prevNoteIds.length === 0;

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

  return NextResponse.json({
    /** 对比期起止（前端用于显示"vs xxxx → xxxx"） */
    start_date: prevFromDate,
    end_date: prevToDate,
    current,
    previous: no_comparison ? null : previous,
    changes: no_comparison ? null : changes,
    trend,
    no_comparison,
  });
}
