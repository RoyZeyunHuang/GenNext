import { NextRequest, NextResponse } from "next/server";
import {
  fetchLatestRowsForPublishRange,
  noteRowKey,
} from "@/lib/kpi-latest-notes-in-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
} as const;

/** 供 Campaign Report 新建时多选笔记：与全量笔记同口径的日期区间内全部候选 */
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

  const rows = await fetchLatestRowsForPublishRange(from_date, to_date);
  const options = rows
    .map((r) => ({
      key: noteRowKey(r),
      title: String(r.title ?? "").trim() || "（无标题）",
      note_id: r.note_id ? String(r.note_id) : null,
    }))
    .filter((o) => o.key)
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

  return NextResponse.json({ options, count: options.length }, { headers: NO_STORE });
}
