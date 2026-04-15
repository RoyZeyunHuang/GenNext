import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findNewsDocId } from "@/lib/news-to-doc";
import { getPersonaOverlay } from "@/lib/news-persona-overlay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/news-feed/[id] — 文章全文（含 bookmarked + doc_id） */
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

  const { data: bm } = await supabase
    .from("news_bookmarks")
    .select("id")
    .eq("user_id", session.userId)
    .eq("article_id", id)
    .maybeSingle();

  const bookmarked = !!bm;
  const doc_id = bookmarked
    ? await findNewsDocId(getSupabaseAdmin(), session.userId, id)
    : null;

  const overlay = getPersonaOverlay(id);
  if (overlay) {
    return NextResponse.json({
      ...article,
      title: overlay.title,
      content: overlay.body,
      source_name: overlay.persona_name,
      persona_name: overlay.persona_name,
      persona_id: overlay.persona_id,
      persona_angle: overlay.angle,
      original_title: article.title,
      original_content: article.content,
      original_source_name: article.source_name,
      image_url: null,
      bookmarked,
      doc_id,
    });
  }

  return NextResponse.json({ ...article, bookmarked, doc_id });
}
