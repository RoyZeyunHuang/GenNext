import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { data, error } = await supabase
    .from("companies")
    .select("*, contacts(*), property_companies(*, properties(id, name, address, area))")
    .eq("id", params.id)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  body.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("companies").update(body).eq("id", params.id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { error } = await supabase.from("companies").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
