import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", params.id)
    .order("is_primary", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  body.company_id = params.id;
  const { data, error } = await supabase.from("contacts").insert(body).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
