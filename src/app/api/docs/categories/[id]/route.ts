import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { canModifyByOwner, resolveOwnerIdForUpdate } from "@/lib/docs-scope";
import { getRfSession } from "@/lib/rf-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getRfSession();
  const body = await req.json();
  const { name, icon, description, is_auto_include, sort_order, is_public } = body;

  const { data: existing, error: fetchErr } = await supabase
    .from("doc_categories")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canModifyByOwner(session, existing.owner_id as string | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (icon !== undefined) updates.icon = String(icon).trim() || "📁";
  if (description !== undefined) updates.description = description?.trim() || null;
  if (is_auto_include !== undefined) updates.is_auto_include = !!is_auto_include;
  if (sort_order !== undefined) updates.sort_order = Number(sort_order) ?? 0;

  const nextOwner = resolveOwnerIdForUpdate(session, is_public, existing.owner_id as string | null);
  if (nextOwner !== undefined) updates.owner_id = nextOwner;

  const { data, error } = await supabase.from("doc_categories").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getRfSession();

  const { data: existing, error: fetchErr } = await supabase
    .from("doc_categories")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canModifyByOwner(session, existing.owner_id as string | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("doc_categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
