import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const ALLOWED_PUT_KEYS = [
  "stage", "deal_status", "lost_reason", "price", "term",
  "contact_name", "contact_info", "notes", "updated_at",
];

export async function PUT(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  body.updated_at = new Date().toISOString();
  const payload: Record<string, unknown> = {};
  for (const k of ALLOWED_PUT_KEYS) {
    if (body[k] !== undefined) payload[k] = body[k];
  }
  const { data, error } = await supabase
    .from("outreach")
    .update(payload)
    .eq("id", params.id)
    .select("*, properties(id, name, address)")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const body = await req.json() as { stage: string; lost_reason?: string };
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString(), stage: body.stage };
  if (body.lost_reason !== undefined) payload.lost_reason = body.lost_reason;
  const { data, error } = await supabase
    .from("outreach")
    .update(payload)
    .eq("id", params.id)
    .select("*, properties(id, name, address)")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
