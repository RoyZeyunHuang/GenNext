import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const areas = req.nextUrl.searchParams.get("areas") ?? "";
  let q = supabase.from("properties").select("*, property_companies(id, role, company_id, companies(id, name))").order("created_at", { ascending: false });
  if (search) q = q.ilike("name", `%${search}%`);
  if (areas) q = q.in("area", areas.split(","));
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companies: links, ...propData } = body as Record<string, unknown> & { companies?: { company_id: string; role: string }[] };
  const { data, error } = await supabase.from("properties").insert(propData).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (links?.length) {
    await supabase.from("property_companies").insert(
      links.map((l) => ({ property_id: data.id, company_id: l.company_id, role: l.role }))
    );
  }
  return Response.json(data);
}
