import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { property_id, company_id, role } = body;
  if (!property_id || !company_id || !role)
    return Response.json({ error: "property_id, company_id, role required" }, { status: 400 });
  const { data, error } = await supabase
    .from("property_companies")
    .insert({ property_id, company_id, role })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
