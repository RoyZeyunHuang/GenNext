import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: plan_id } = await params;
  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("plan_id", plan_id)
    .order("publish_date", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: plan_id } = await params;
  const body = await req.json();
  const items = Array.isArray(body.items) ? body.items : [body];
  const toInsert = items.map((it: Record<string, unknown>) => ({
    plan_id,
    account_id: it.account_id ?? null,
    publish_date: it.publish_date,
    task_template_doc_id: it.task_template_doc_id ?? null,
    brand_doc_ids: Array.isArray(it.brand_doc_ids) ? it.brand_doc_ids : [],
    title: typeof it.title === "string" ? it.title.trim() || null : null,
    brief: typeof it.brief === "string" ? it.brief.trim() || null : null,
    script: typeof it.script === "string" ? it.script.trim() || null : null,
    cover_idea: typeof it.cover_idea === "string" ? it.cover_idea.trim() || null : null,
    comment_guide: typeof it.comment_guide === "string" ? it.comment_guide.trim() || null : null,
    property_name: typeof it.property_name === "string" ? it.property_name.trim() || null : null,
    content_type: it.content_type ?? "视频",
    video_format: it.video_format ?? "素材混剪",
    tags: Array.isArray(it.tags) ? it.tags : [],
    status: it.status ?? "idea",
    sort_order: Number(it.sort_order) ?? 0,
  }));

  const { data, error } = await supabase.from("content_items").insert(toInsert).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(Array.isArray(data) ? data : [data]);
}
