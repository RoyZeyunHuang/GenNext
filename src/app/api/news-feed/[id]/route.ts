import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/news-feed/[id] — 文章全文 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { data: article, error } = await supabase
    .from("news_feed")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!article) return NextResponse.json({ error: "文章不存在" }, { status: 404 });

  // Check bookmark
  const { data: bm } = await supabase
    .from("news_bookmarks")
    .select("id")
    .eq("user_id", session.userId)
    .eq("article_id", id)
    .maybeSingle();

  return NextResponse.json({ ...article, bookmarked: !!bm });
}
