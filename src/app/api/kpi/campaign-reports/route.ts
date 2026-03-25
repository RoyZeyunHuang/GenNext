import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase.from("campaign_reports").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const noteKeys = Array.isArray(body.note_keys)
    ? body.note_keys.map((k: unknown) => String(k).trim()).filter(Boolean)
    : [];
  const { data, error } = await supabase.from("campaign_reports").insert({
    id: body.id ?? crypto.randomUUID(),
    title: body.title,
    summary: body.summary ?? "",
    date_from: body.date_from,
    date_to: body.date_to,
    aggregate_json: body.aggregate_json ? JSON.stringify(body.aggregate_json) : null,
    top_posts_json: body.top_posts_json ? JSON.stringify(body.top_posts_json) : null,
    note_keys_json: noteKeys.length > 0 ? JSON.stringify(noteKeys) : null,
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
