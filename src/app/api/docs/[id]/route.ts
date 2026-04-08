import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { canModifyByOwner, resolveOwnerIdForUpdate } from "@/lib/docs-scope";
import { getRfSession } from "@/lib/rf-session";
import type { RfSession } from "@/lib/rf-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function categoryAccessible(
  categoryId: string,
  session: RfSession | null
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data: cat, error } = await supabase
    .from("doc_categories")
    .select("owner_id")
    .eq("id", categoryId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
  if (!cat) return { ok: false, status: 404, message: "category not found" };
  if (!session) return { ok: true };
  const o = cat.owner_id as string | null;
  if (o === null || o === session.userId || session.isAdmin) return { ok: true };
  return { ok: false, status: 403, message: "forbidden" };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getRfSession();
  const body = await req.json();
  const { title, content, tags, metadata, sort_order, is_public, category_id } = body;

  const { data: existing, error: fetchErr } = await supabase
    .from("docs")
    .select("id, owner_id, category_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canModifyByOwner(session, existing.owner_id as string | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const nextCategoryId = category_id !== undefined ? String(category_id) : (existing.category_id as string);
  if (category_id !== undefined && nextCategoryId !== existing.category_id) {
    const catCheck = await categoryAccessible(nextCategoryId, session);
    if (!catCheck.ok) return NextResponse.json({ error: catCheck.message }, { status: catCheck.status });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = String(title).trim();
  if (content !== undefined) updates.content = content?.trim() || null;
  if (tags !== undefined) {
    updates.tags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
        ? tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
  }
  if (metadata !== undefined && typeof metadata === "object") updates.metadata = metadata;
  if (sort_order !== undefined) updates.sort_order = Number(sort_order) ?? 0;
  if (category_id !== undefined) updates.category_id = nextCategoryId;

  const nextOwner = resolveOwnerIdForUpdate(session, is_public, existing.owner_id as string | null);
  if (nextOwner !== undefined) updates.owner_id = nextOwner;

  const { data, error } = await supabase.from("docs").update(updates).eq("id", id).select().single();
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
    .from("docs")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canModifyByOwner(session, existing.owner_id as string | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("docs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
