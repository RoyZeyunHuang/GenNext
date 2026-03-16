import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category_id = searchParams.get("category_id");
  const search = searchParams.get("search")?.trim() || "";
  let q = supabase
    .from("docs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
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
  const body = await req.json();
  const { category_id, title, content, tags, metadata, sort_order } = body;
  if (!category_id || !title?.trim()) return NextResponse.json({ error: "category_id and title required" }, { status: 400 });
  const tagsArr = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
  const { data, error } = await supabase
    .from("docs")
    .insert({
      category_id,
      title: title.trim(),
      content: content?.trim() || null,
      tags: tagsArr,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      sort_order: Number(sort_order) ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
