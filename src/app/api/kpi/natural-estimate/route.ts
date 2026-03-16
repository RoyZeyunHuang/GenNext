import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const snapshotDate = searchParams.get("snapshot_date");
  const from_date = searchParams.get("from_date");
  const to_date = searchParams.get("to_date");
  console.log("[natural-estimate] 收到请求，参数:", {
    snapshot_date: snapshotDate,
    from_date: from_date ?? "(未传)",
    to_date: to_date ?? "(未传)",
  });
  if (!snapshotDate) {
    return NextResponse.json(
      { error: "snapshot_date required" },
      { status: 400 }
    );
  }
  const fromDate = from_date ?? snapshotDate;
  const toDate = to_date ?? snapshotDate;

  const { data: notes, error: notesErr } = await supabase
    .from("xhs_notes_with_publish_date")
    .select("*")
    .eq("snapshot_date", snapshotDate)
    .gte("publish_date", fromDate)
    .lte("publish_date", toDate)
    .eq("is_paid", true);

  if (notesErr) {
    console.log("[natural-estimate] 查询错误:", notesErr.message);
    return NextResponse.json({ error: notesErr.message }, { status: 500 });
  }
  const paidNotes = notes ?? [];
  console.log("[natural-estimate] 查询结果条数:", paidNotes.length);

  const { data: paidRows } = await supabase
    .from("xhs_paid_daily")
    .select("note_id, impressions, interactions")
    .eq("event_date", snapshotDate);

  const paidByNoteId = new Map<string, { impressions: number; interactions: number }>();
  for (const r of paidRows ?? []) {
    const nid = String(r.note_id ?? "").trim();
    if (!nid) continue;
    const cur = paidByNoteId.get(nid) ?? { impressions: 0, interactions: 0 };
    cur.impressions += toNum(r.impressions);
    cur.interactions += toNum(r.interactions);
    paidByNoteId.set(nid, cur);
  }

  const rows: {
    title: string;
    total_exposure: number;
    paid_exposure: number;
    natural_exposure: number;
    natural_ratio: number;
  }[] = [];

  for (const n of paidNotes) {
    const totalExposure = Number(n.exposure ?? 0);
    const noteId = n.note_id ? String(n.note_id).trim() : null;
    const paid = noteId ? paidByNoteId.get(noteId) : null;
    const paidExposure = paid ? paid.impressions : 0;
    const naturalExposure = Math.max(0, totalExposure - paidExposure);
    const naturalRatio = totalExposure > 0 ? naturalExposure / totalExposure : 0;
    rows.push({
      title: n.title ?? "",
      total_exposure: totalExposure,
      paid_exposure: paidExposure,
      natural_exposure: naturalExposure,
      natural_ratio: naturalRatio,
    });
  }

  rows.sort((a, b) => b.natural_ratio - a.natural_ratio);

  const avgNaturalRatio =
    rows.length > 0
      ? rows.reduce((s, r) => s + r.natural_ratio, 0) / rows.length
      : 0;
  const highest = rows[0] ?? null;
  const lowest = rows.length > 0 ? rows[rows.length - 1] : null;

  return NextResponse.json({
    list: rows,
    summary: {
      avg_natural_ratio: avgNaturalRatio,
      highest_note: highest ? { title: highest.title, ratio: highest.natural_ratio } : null,
      lowest_note: lowest ? { title: lowest.title, ratio: lowest.natural_ratio } : null,
    },
  });
}
