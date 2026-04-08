import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { docsOwnerOrFilter, resolveOwnerIdForCreate } from "@/lib/docs-scope";
import { getRfSession } from "@/lib/rf-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getRfSession();
  const { searchParams } = new URL(req.url);
  const with_counts = searchParams.get("with_counts") === "true";

  let q = supabase.from("doc_categories").select("*").order("sort_order", { ascending: true });
  const ownerFilter = docsOwnerOrFilter(session);
  if (ownerFilter) q = q.or(ownerFilter);

  const { data: categories, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = categories ?? [];

  if (with_counts && list.length > 0) {
    let dq = supabase.from("docs").select("category_id, owner_id");
    if (ownerFilter) dq = dq.or(ownerFilter);
    const { data: docRows } = await dq;
    const countByCategory: Record<string, number> = {};
    for (const c of list) countByCategory[c.id] = 0;
    for (const d of docRows ?? []) {
      if (d.category_id) countByCategory[d.category_id] = (countByCategory[d.category_id] ?? 0) + 1;
    }
    return NextResponse.json(list.map((c) => ({ ...c, doc_count: countByCategory[c.id] ?? 0 })));
  }
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await getRfSession();
  const body = await req.json();
  const { name, icon = "📁", description, is_auto_include = false, sort_order = 0, is_public } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const ownerId = resolveOwnerIdForCreate(session, is_public === true);
  const insertPayload: Record<string, unknown> = {
    name: name.trim(),
    icon: icon?.trim() || "📁",
    description: description?.trim() || null,
    is_auto_include: !!is_auto_include,
    sort_order: Number(sort_order) || 0,
  };
  if (ownerId !== undefined) insertPayload.owner_id = ownerId;

  const { data, error } = await supabase.from("doc_categories").insert(insertPayload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
