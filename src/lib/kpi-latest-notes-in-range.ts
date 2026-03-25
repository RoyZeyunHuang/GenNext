import { supabase } from "@/lib/supabase";

/** 与 notes-comparison / notes-stats 一致的「发布日期区间 + 每笔记最新快照」行 */
export type LatestNoteInRangeRow = {
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

export function noteRowKey(r: {
  note_id?: string | null;
  title?: string | null;
}): string {
  return String(r.note_id ?? r.title ?? "").trim();
}

/**
 * publish_date 在 [from,todate] 的笔记取最新快照；无 publish_date 时用 snapshot_date 落在区间内兜底。
 */
export async function fetchLatestRowsForPublishRange(
  fromDate: string,
  toDate: string,
  accountNoteIds?: string[]
): Promise<LatestNoteInRangeRow[]> {
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
    console.error("[kpi-latest-notes] 主查询错误:", primaryError.message);
  }

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

  const allRows = [...(primary ?? []), ...(fallback ?? [])] as LatestNoteInRangeRow[];

  const latestByNote = new Map<string, LatestNoteInRangeRow>();
  for (const row of allRows) {
    const key = noteRowKey(row);
    if (!key) continue;
    const existing = latestByNote.get(key);
    if (!existing || String(row.snapshot_date) > String(existing.snapshot_date)) {
      latestByNote.set(key, row);
    }
  }
  return Array.from(latestByNote.values());
}
