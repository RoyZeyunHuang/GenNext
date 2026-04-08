import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { docsOwnerOrFilter, resolveOwnerIdForCreate } from "@/lib/docs-scope";
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

export async function GET(req: NextRequest) {
  const session = await getRfSession();
  const { searchParams } = new URL(req.url);
  const category_id = searchParams.get("category_id");
  const search = searchParams.get("search")?.trim() || "";

  let q = supabase
    .from("docs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  const ownerFilter = docsOwnerOrFilter(session);
  if (ownerFilter) q = q.or(ownerFilter);
  if (category_id) q = q.eq("category_id", category_id);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let list = data ?? [];
  if (search) {
    const lower = search.toLowerCase();
    list = list.filter(
      (d) =>
        (d.title ?? "").toLowerCase().includes(lower) ||
        (d.content ?? "").toLowerCase().includes(lower) ||
        ((d.tags as string[]) ?? []).some((t: string) => t.toLowerCase().includes(lower))
    );
  }
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await getRfSession();
  const body = await req.json();
  const { category_id, title, content, tags, metadata, sort_order, is_public } = body;
  if (!category_id || !title?.trim()) {
    return NextResponse.json({ error: "category_id and title required" }, { status: 400 });
  }

  const catCheck = await categoryAccessible(category_id, session);
  if (!catCheck.ok) return NextResponse.json({ error: catCheck.message }, { status: catCheck.status });

  const tagsArr = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];
  const ownerId = resolveOwnerIdForCreate(session, is_public === true);
  const insertPayload: Record<string, unknown> = {
    category_id,
    title: title.trim(),
    content: content?.trim() || null,
    tags: tagsArr,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    sort_order: Number(sort_order) ?? 0,
  };
  if (ownerId !== undefined) insertPayload.owner_id = ownerId;

  const { data, error } = await supabase.from("docs").insert(insertPayload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
