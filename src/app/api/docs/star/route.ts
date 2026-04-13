import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAR_CATEGORY_NAME = "收藏";
const STAR_CATEGORY_ICON = "⭐";

/**
 * POST /api/docs/star
 * Saves generated content into the user's personal "收藏" category in 素材库.
 * Auto-creates the category if it doesn't exist yet.
 */
export async function POST(req: NextRequest) {
  const session = await getRfSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, content, metadata } = body;
  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Find or create user's 收藏 category
  const { data: existing } = await supabase
    .from("doc_categories")
    .select("id")
    .eq("name", STAR_CATEGORY_NAME)
    .eq("owner_id", session.userId)
    .maybeSingle();

  let categoryId: string;
  if (existing) {
    categoryId = existing.id;
  } else {
    const { data: created, error: catErr } = await supabase
      .from("doc_categories")
      .insert({
        name: STAR_CATEGORY_NAME,
        icon: STAR_CATEGORY_ICON,
        owner_id: session.userId,
        sort_order: 999,
      })
      .select("id")
      .single();
    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    categoryId = created.id;
  }

  // Create the doc
  const docTitle = title?.trim() || content.trim().slice(0, 50) + "…";
  const { data: doc, error: docErr } = await supabase
    .from("docs")
    .insert({
      category_id: categoryId,
      title: docTitle,
      content: content.trim(),
      tags: ["收藏"],
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      owner_id: session.userId,
    })
    .select()
    .single();

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });
  return NextResponse.json(doc);
}
