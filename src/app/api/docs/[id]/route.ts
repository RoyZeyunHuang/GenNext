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
  const { title, content, tags, metadata, sort_order } = body;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = String(title).trim();
  if (content !== undefined) updates.content = content?.trim() || null;
  if (tags !== undefined) {
    updates.tags = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
  }
  if (metadata !== undefined && typeof metadata === "object") updates.metadata = metadata;
  if (sort_order !== undefined) updates.sort_order = Number(sort_order) ?? 0;
  const { data, error } = await supabase
    .from("docs")
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
  const { error } = await supabase.from("docs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
