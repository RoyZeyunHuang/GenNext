import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
} as const;

type Row = {
  note_id: string | null;
  note_title: string | null;
};

/** 投放 Campaign：候选笔记 = 该日期范围内 xhs_paid_daily 出现过的 note_id（匹配键统一为笔记 ID） */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from_date = searchParams.get("from_date");
  const to_date = searchParams.get("to_date");
  if (!from_date || !to_date) {
    return NextResponse.json(
      { error: "from_date and to_date required" },
      { status: 400, headers: NO_STORE }
    );
  }

  const { data, error } = await supabase
    .from("xhs_paid_daily")
    .select("note_id, note_title, event_date")
    .gte("event_date", from_date)
    .lte("event_date", to_date)
    .not("note_id", "is", null);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_STORE }
    );
  }

  const byId = new Map<string, { title: string }>();
  for (const r of (data ?? []) as Row[]) {
    const id = String(r.note_id ?? "").trim();
    if (!id) continue;
    const title = String(r.note_title ?? "").trim();
    const prev = byId.get(id);
    if (!prev || (title && !prev.title)) {
      byId.set(id, { title: title || prev?.title || "" });
    }
  }

  const options = Array.from(byId.entries())
    .map(([note_id, { title }]) => ({
      key: note_id,
      note_id,
      title: title || note_id,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

  return NextResponse.json({ options, count: options.length }, { headers: NO_STORE });
}
