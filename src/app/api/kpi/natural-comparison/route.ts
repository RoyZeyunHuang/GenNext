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
  note_id?: string | null;
  title?: string | null;
  is_paid?: boolean | null;
  exposure?: unknown;
  views?: unknown;
  likes?: unknown;
  comments?: unknown;
  collects?: unknown;
  shares?: unknown;
};

type PaidAgg = { impressions: number; interactions: number };

function getInteraction(r: NoteRow) {
  return (
    toNum(r.likes) + toNum(r.comments) + toNum(r.collects) + toNum(r.shares)
  );
}

function aggregateNatural(rows: NoteRow[], paidByNoteId: Map<string, PaidAgg>) {
  let total_exposure = 0;
  let total_views = 0;
  let total_interactions = 0;
  let natural_exposure = 0;
  let natural_interactions = 0;

  for (const r of rows) {
    const exposure = toNum(r.exposure);
    const views = toNum(r.views);
    const interactions = getInteraction(r);
    const noteId = String(r.note_id ?? "").trim();
    const paid = noteId ? paidByNoteId.get(noteId) : undefined;
    const paidExposure = paid?.impressions ?? 0;
    const paidInteractions = paid?.interactions ?? 0;

    total_exposure += exposure;
    total_views += views;
    total_interactions += interactions;
    natural_exposure += Math.max(0, exposure - paidExposure);
    natural_interactions += Math.max(0, interactions - paidInteractions);
  }

  const natural_interaction_rate =
    total_views > 0 ? natural_interactions / total_views : 0;
  const natural_ratio = total_exposure > 0 ? natural_exposure / total_exposure : 0;

  return {
    natural_exposure,
    natural_interactions,
    natural_interaction_rate,
    natural_ratio,
    total_exposure,
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
  if (!from_date || !to_date) {
    return NextResponse.json(
      { error: "from_date and to_date required" },
      { status: 400 }
    );
  }

  const { data: noteData, error: noteErr } = await supabase
    .from("xhs_notes_with_publish_date")
    .select(
      "snapshot_date, note_id, title, is_paid, exposure, views, likes, comments, collects, shares"
    )
    .gte("snapshot_date", from_date)
    .lte("snapshot_date", to_date)
    .gte("publish_date", from_date)
    .lte("publish_date", to_date)
    .order("snapshot_date", { ascending: true });
  if (noteErr) {
    return NextResponse.json({ error: noteErr.message }, { status: 500 });
  }

  const notes = (noteData ?? []) as NoteRow[];
  const dates = [...new Set(notes.map((r) => String(r.snapshot_date).slice(0, 10)))];
  if (dates.length === 0) {
    return NextResponse.json({
      start_date: null,
      end_date: null,
      current: null,
      previous: null,
      changes: null,
      trend: [],
      list: [],
      no_comparison: true,
    });
  }

  const start_date = dates[0];
  const end_date = dates[dates.length - 1];
  const no_comparison = start_date === end_date;

  const { data: paidRows, error: paidErr } = await supabase
    .from("xhs_paid_daily")
    .select("note_id, impressions, interactions")
    .gte("event_date", from_date)
    .lte("event_date", to_date);
  if (paidErr) {
    return NextResponse.json({ error: paidErr.message }, { status: 500 });
  }

  const paidByNoteId = new Map<string, PaidAgg>();
  for (const r of paidRows ?? []) {
    const id = String(r.note_id ?? "").trim();
    if (!id) continue;
    const cur = paidByNoteId.get(id) ?? { impressions: 0, interactions: 0 };
    cur.impressions += toNum(r.impressions);
    cur.interactions += toNum(r.interactions);
    paidByNoteId.set(id, cur);
  }

  const byDate = new Map<string, NoteRow[]>();
  for (const r of notes) {
    const d = String(r.snapshot_date).slice(0, 10);
    const list = byDate.get(d) ?? [];
    list.push(r);
    byDate.set(d, list);
  }

  const previous = aggregateNatural(byDate.get(start_date) ?? [], paidByNoteId);
  const current = aggregateNatural(byDate.get(end_date) ?? [], paidByNoteId);
  const changes = {
    natural_exposure: metricChange(
      current.natural_exposure,
      previous.natural_exposure
    ),
    natural_interactions: metricChange(
      current.natural_interactions,
      previous.natural_interactions
    ),
    natural_interaction_rate: metricChange(
      current.natural_interaction_rate,
      previous.natural_interaction_rate
    ),
    natural_ratio: metricChange(current.natural_ratio, previous.natural_ratio),
  };

  const trend = dates.map((d) => {
    const a = aggregateNatural(byDate.get(d) ?? [], paidByNoteId);
    return {
      date: d,
      natural_exposure: a.natural_exposure,
      natural_interactions: a.natural_interactions,
      natural_interaction_rate: a.natural_interaction_rate,
      natural_ratio: a.natural_ratio,
    };
  });

  const endRows = byDate.get(end_date) ?? [];
  const list = endRows
    .filter((r) => r.is_paid === true)
    .map((r) => {
      const total_exposure = toNum(r.exposure);
      const noteId = String(r.note_id ?? "").trim();
      const paid = noteId ? paidByNoteId.get(noteId) : undefined;
      const paid_exposure = paid?.impressions ?? 0;
      const natural_exposure = Math.max(0, total_exposure - paid_exposure);
      const natural_ratio =
        total_exposure > 0 ? natural_exposure / total_exposure : 0;
      return {
        title: r.title ?? "",
        total_exposure,
        paid_exposure,
        natural_exposure,
        natural_ratio,
      };
    })
    .sort((a, b) => b.natural_ratio - a.natural_ratio);

  return NextResponse.json({
    start_date,
    end_date,
    current,
    previous,
    changes,
    trend,
    list,
    no_comparison,
  });
}
