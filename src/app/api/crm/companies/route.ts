import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const type = req.nextUrl.searchParams.get("type") ?? "";
  const includeRaw = req.nextUrl.searchParams.get("include") ?? "";
  const parts = includeRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const wantContacts = parts.includes("contacts");
  const wantProps = parts.includes("properties");
  let select = "*";
  if (wantContacts && wantProps) {
    select = "*, contacts(*), property_companies(*, properties(id, name))";
  } else if (wantContacts) {
    select = "*, contacts(*)";
  } else if (wantProps) {
    select = "*, property_companies(*, properties(id, name))";
  }
  let q = supabase.from("companies").select(select).order("created_at", { ascending: false });
  if (search) q = q.ilike("name", `%${search}%`);
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabase.from("companies").insert(body).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
