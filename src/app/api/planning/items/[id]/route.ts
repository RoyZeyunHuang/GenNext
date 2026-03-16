import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const allowed = [
    "account_id", "publish_date", "task_template_doc_id", "brand_doc_ids",
    "title", "brief", "script", "cover_idea", "comment_guide", "property_name",
    "content_type", "video_format", "tags", "status", "sort_order",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (key === "brand_doc_ids") updates[key] = Array.isArray(body[key]) ? body[key] : [];
    else if (key === "tags") updates[key] = Array.isArray(body[key]) ? body[key] : [];
    else if (key === "publish_date" || key === "account_id") updates[key] = body[key];
    else updates[key] = typeof body[key] === "string" ? body[key].trim() : body[key];
  }

  const { data, error } = await supabase
    .from("content_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("content_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
