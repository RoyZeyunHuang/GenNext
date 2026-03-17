import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const ALLOWED_PUT_KEYS = ["name", "title", "phone", "email", "linkedin_url", "is_primary"];

export async function PUT(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED_PUT_KEYS) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) return Response.json({ error: "No allowed fields" }, { status: 400 });
  const { data, error } = await supabase.from("contacts").update(updates).eq("id", params.id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { error } = await supabase.from("contacts").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
