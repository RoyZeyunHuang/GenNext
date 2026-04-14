import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/news-feed/[id]/bookmark — toggle bookmark */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // Check if already bookmarked
  const { data: existing } = await supabase
    .from("news_bookmarks")
    .select("id")
    .eq("user_id", session.userId)
    .eq("article_id", id)
    .maybeSingle();

  const admin = getSupabaseAdmin();

  if (existing) {
    // Remove bookmark
    await admin
      .from("news_bookmarks")
      .delete()
      .eq("id", existing.id);
    return NextResponse.json({ bookmarked: false });
  }

  // Add bookmark
  const { error } = await admin
    .from("news_bookmarks")
    .insert({ user_id: session.userId, article_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookmarked: true });
}
