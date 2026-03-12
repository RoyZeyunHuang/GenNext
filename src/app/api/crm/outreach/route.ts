import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("outreach")
    .select("*, properties(id, name, address)")
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabase.from("outreach").insert(body).select("*, properties(id, name, address)").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
