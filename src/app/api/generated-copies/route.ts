import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("generated_copies_v2")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_input, doc_ids, brand_doc_ids, knowledge_doc_ids, task_template_id, persona_template_id, detected_intent, output, platform, starred } = body;
  const insertPayload: Record<string, unknown> = {
    user_input: user_input ?? null,
    brand_doc_ids: brand_doc_ids || [],
    knowledge_doc_ids: knowledge_doc_ids || [],
    task_template_id: task_template_id || null,
    persona_template_id: persona_template_id || null,
    detected_intent: detected_intent ?? null,
    output: output ?? null,
    platform: platform ?? null,
    starred: starred ?? false,
  };
  if (Array.isArray(doc_ids) && doc_ids.length > 0) {
    insertPayload.doc_ids = doc_ids;
  }
  const { data, error } = await supabase
    .from("generated_copies_v2")
    .insert(insertPayload)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
