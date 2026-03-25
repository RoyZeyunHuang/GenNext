import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

type NoteRow = {
  note_id?: string | null;
  title?: string | null;
  publish_date?: string | null;
  snapshot_date: string;
  exposure?: unknown;
  views?: unknown;
  likes?: unknown;
  comments?: unknown;
  collects?: unknown;
  shares?: unknown;
  follows?: unknown;
  cover_ctr?: unknown;
  avg_watch_time?: unknown;
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

/**
 * 拉取 publish_date 在 [fromDate, toDate] 范围内的所有快照行，
 * 然后在 JS 侧按笔记（note_id 或 title）保留最新快照。
 *
 * 当 publish_date 为 NULL（日期格式无法解析）时，
 * 兜底用 snapshot_date 过滤（保证老数据不丢失）。
 */
async function fetchLatestRowsForPublishRange(
  fromDate: string,
  toDate: string,
  accountNoteIds?: string[]
): Promise<NoteRow[]> {
  // 主查询：publish_date 在范围内的所有快照行
  let q = supabase
    .from("xhs_notes_with_publish_date")
    .select(
      "note_id, title, publish_date, snapshot_date, exposure, views, likes, comments, collects, shares, follows, cover_ctr, avg_watch_time, is_paid"
    )
    .gte("publish_date", fromDate)
    .lte("publish_date", toDate);
  if (accountNoteIds?.length) {
    q = q.in("note_id", accountNoteIds);
  }
  const { data: primary, error: primaryError } = await q;
  if (primaryError) {
    console.error("[notes-comparison] 主查询错误:", primaryError.message);
  }

  // 兜底查询：publish_date 为 NULL 时用 snapshot_date 过滤
  // （应对 publish_time 格式无法解析的笔记，如"3天前"等）
  let fallbackQ = supabase
    .from("xhs_notes_with_publish_date")
    .select(
      "note_id, title, publish_date, snapshot_date, exposure, views, likes, comments, collects, shares, follows, cover_ctr, avg_watch_time, is_paid"
    )
    .is("publish_date", null)
    .gte("snapshot_date", fromDate)
    .lte("snapshot_date", toDate);
  if (accountNoteIds?.length) {
    fallbackQ = fallbackQ.in("note_id", accountNoteIds);
  }
  const { data: fallback } = await fallbackQ;

  const allRows = [...(primary ?? []), ...(fallback ?? [])] as NoteRow[];
  console.log(
    `[notes-comparison] publish范围[${fromDate}→${toDate}] 主查${(primary ?? []).length}行 + 兜底${(fallback ?? []).length}行`
  );

  // 按笔记保留最新快照（key = note_id 优先，否则用 title）
  const latestByNote = new Map<string, NoteRow>();
  for (const row of allRows) {
    const key = String(row.note_id ?? row.title ?? "").trim();
    if (!key) continue;
    const existing = latestByNote.get(key);
    if (!existing || String(row.snapshot_date) > String(existing.snapshot_date)) {
      latestByNote.set(key, row);
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
    if (accountNoteIds.length === 0) return jsonRes(noDataResponse);
  }

  // ① 当前期
  const currentRows = await fetchLatestRowsForPublishRange(
    from_date,
    to_date,
    accountNoteIds
  );
  if (currentRows.length === 0) return jsonRes(noDataResponse);

  const current = aggregate(currentRows);

  // 趋势：按 publish_date（或 snapshot_date 兜底）分组
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

  // ② 对比期：往前推同等天数
  const fromMs = new Date(from_date).getTime();
  const toMs = new Date(to_date).getTime();
  const durationDays = Math.max(1, Math.round((toMs - fromMs) / 86400000));
  const prevToDate = new Date(fromMs - 86400000).toISOString().slice(0, 10);
  const prevFromDate = new Date(
    fromMs - 86400000 - durationDays * 86400000
  ).toISOString().slice(0, 10);

  const prevRows = await fetchLatestRowsForPublishRange(
    prevFromDate,
    prevToDate,
    accountNoteIds
  );
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
