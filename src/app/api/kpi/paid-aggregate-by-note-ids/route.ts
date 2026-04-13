import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  fetchLatestRowsForPublishRange,
  noteRowKey,
} from "@/lib/kpi-latest-notes-in-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY = {
  spend: 0,
  dm_in: 0,
  dm_open: 0,
  dm_lead: 0,
  distinct_creators: 0,
  paid_note_count: 0,
};

/** 在 Campaign 日期窗口内，按 note_id 汇总 xhs_paid_daily（投放花费与私信等） */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const noteIdsCsv = (sp.get("note_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const noteKeys = sp.getAll("note_key").map((s) => s.trim()).filter(Boolean);
  const allNotesInRange = sp.get("all_notes_in_campaign_range") === "1";

  let noteIds = noteIdsCsv;

  if (noteIds.length === 0 && from && to && (noteKeys.length > 0 || allNotesInRange)) {
    const rows = await fetchLatestRowsForPublishRange(from, to);
    let filtered = rows;
    if (noteKeys.length > 0) {
      const allowed = new Set(noteKeys);
      filtered = rows.filter((r) => allowed.has(noteRowKey(r)));
    }
    noteIds = Array.from(
      new Set(
        filtered
          .map((r) => (r.note_id ? String(r.note_id).trim() : ""))
          .filter(Boolean)
      )
    );
  }

  if (noteIds.length === 0) {
    return NextResponse.json(EMPTY);
  }

  let q = supabase
    .from("xhs_paid_daily")
    .select("note_id, event_date, spend, dm_in, dm_open, dm_lead, creator")
    .in("note_id", noteIds);
  if (from) q = q.gte("event_date", from);
  if (to) q = q.lte("event_date", to);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let spend = 0;
  let dm_in = 0;
  let dm_open = 0;
  let dm_lead = 0;
  const creators = new Set<string>();
  const paidNoteIds = new Set<string>();

  for (const row of data ?? []) {
    spend += Number(row.spend) || 0;
    dm_in += Number(row.dm_in) || 0;
    dm_open += Number(row.dm_open) || 0;
    dm_lead += Number(row.dm_lead) || 0;
    const c = row.creator as string | null;
    if (c && String(c).trim()) creators.add(String(c).trim());
    const nid = row.note_id as string | null;
    if (nid && String(nid).trim()) paidNoteIds.add(String(nid).trim());
  }

  return NextResponse.json({
    spend: Math.round(spend * 100) / 100,
    dm_in,
    dm_open,
    dm_lead,
    distinct_creators: creators.size,
    /** 在时间范围内 xhs_paid_daily 里出现过记录的笔记数（去重 note_id） */
    paid_note_count: paidNoteIds.size,
  });
}
