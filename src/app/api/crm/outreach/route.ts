import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("property_id");
  let q = supabase
    .from("outreach")
    .select("*, properties(id, name, address, property_companies(role, companies(name)))")
    .order("updated_at", { ascending: false });
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const payload = {
    ...body,
    stage: body.stage ?? "Not Started",
    deal_status: body.deal_status ?? "Active",
  };
  const { data, error } = await supabase.from("outreach").insert(payload).select("*, properties(id, name, address)").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("property_id");
  if (!propertyId) return Response.json({ error: "missing property_id" }, { status: 400 });

  const { error } = await supabase.from("outreach").delete().eq("property_id", propertyId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
