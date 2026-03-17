import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const outreachId = req.nextUrl.searchParams.get("outreach_id");
  const propertyId = req.nextUrl.searchParams.get("property_id");
  let q = supabase
    .from("communication_logs")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (outreachId) q = q.eq("outreach_id", outreachId);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    outreach_id?: string;
    property_id?: string;
    date?: string;
    channel?: string;
    content?: string;
    next_action?: string;
  };
  const { data, error } = await supabase
    .from("communication_logs")
    .insert({
      outreach_id: body.outreach_id ?? null,
      property_id: body.property_id ?? null,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      channel: body.channel ?? null,
      content: body.content ?? null,
      next_action: body.next_action ?? null,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
