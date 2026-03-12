import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  body.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("outreach")
    .update(body)
    .eq("id", params.id)
    .select("*, properties(id, name, address)")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
