import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  if (body.aggregate_json && typeof body.aggregate_json !== "string") body.aggregate_json = JSON.stringify(body.aggregate_json);
  if (body.top_posts_json && typeof body.top_posts_json !== "string") body.top_posts_json = JSON.stringify(body.top_posts_json);
  const { data, error } = await supabase.from("campaign_reports").update(body).eq("id", params.id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { error } = await supabase.from("campaign_reports").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
