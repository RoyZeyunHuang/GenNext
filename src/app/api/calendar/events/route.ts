import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventPayload = {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
};

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .order("date", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data ?? []);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { events: EventPayload[] };
    const events = Array.isArray(body.events) ? body.events : [];
    if (events.length === 0) return Response.json({ inserted: 0 });

    const rows = events.map((e) => ({
      title: e.title ?? null,
      date: e.date || null,
      start_time: e.startTime || null,
      end_time: e.endTime || null,
      location: e.location ?? null,
      description: e.description ?? null,
    }));

    const { data, error } = await supabase
      .from("calendar_events")
      .insert(rows)
      .select("id");

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ inserted: data?.length ?? 0 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) return Response.json({ error: "missing id" }, { status: 400 });

    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
