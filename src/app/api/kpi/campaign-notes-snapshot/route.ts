import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

function toDateString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v.slice(0, 10);
  return null;
}

const NOTE_COLUMNS =
  "id, note_id, title, exposure, views, likes, comments, collects, shares, follows, genre, is_paid, publish_time, snapshot_date";

/** 分页拉满单日快照（避免 PostgREST 单次默认行数上限） */
async function fetchAllNotesForSnapshot(snapshotDate: string) {
  const pageSize = 1000;
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("xhs_notes")
      .select(NOTE_COLUMNS)
      .eq("snapshot_date", snapshotDate)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return { error: error.message as string, notes: [] as Record<string, unknown>[] };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 500000) break;
  }
  return { error: null as string | null, notes: all };
}

/** 按单次快照拉取 xhs_notes 全量，用于 Campaign 选题（不按 Campaign 日期筛发布） */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const requested = sp.get("snapshot_date");

  let snapshotDate = requested ? toDateString(requested) : null;

  if (!snapshotDate) {
    const { data: maxRow, error: dateError } = await supabase
      .from("xhs_notes")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dateError) {
      return NextResponse.json(
        { error: dateError.message },
        { status: 500, headers: NO_STORE }
      );
    }
    snapshotDate = maxRow?.snapshot_date
      ? toDateString(maxRow.snapshot_date)
      : null;
  }

  if (!snapshotDate) {
    return NextResponse.json(
      {
        snapshot_date: null,
        notes: [],
        error: "暂无笔记快照数据，请先上传「笔记列表明细」",
      },
      { headers: NO_STORE }
    );
  }

  const { notes, error } = await fetchAllNotesForSnapshot(snapshotDate);
  if (error) {
    return NextResponse.json({ error }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      snapshot_date: snapshotDate,
      notes,
      note_count: notes.length,
    },
    { headers: NO_STORE }
  );
}
