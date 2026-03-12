import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  let q = supabase.from("knowledge_docs").select("*").order("created_at", { ascending: false });
  if (search) q = q.ilike("title", `%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, content, type, tags, source_url } = body;
  const { data, error } = await supabase
    .from("knowledge_docs")
    .insert({ title, content, type: type || null, tags: tags || [], source_url: source_url || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
