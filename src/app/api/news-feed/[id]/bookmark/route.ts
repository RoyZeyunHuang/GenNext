import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  ensureNewsCategory,
  upsertNewsDoc,
  deleteNewsDoc,
} from "@/lib/news-to-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/news-feed/[id]/bookmark — toggle bookmark
 *
 * 收藏/取消收藏一条新闻。额外副作用：
 *  - 收藏 → 在用户的「新闻收藏」分类（按需创建）下创建一篇 doc，
 *    供黑魔法 RAG 知识库下拉选用。
 *  - 取消收藏 → 同步删除该 doc。
 *
 * 响应： { bookmarked: boolean, doc_id: string | null }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // Check current bookmark state
  const { data: existing } = await supabase
    .from("news_bookmarks")
    .select("id")
    .eq("user_id", session.userId)
    .eq("article_id", id)
    .maybeSingle();

  const admin = getSupabaseAdmin();

  if (existing) {
    // Remove bookmark + sync-delete doc
    await admin.from("news_bookmarks").delete().eq("id", existing.id);
    try {
      await deleteNewsDoc(admin, session.userId, id);
    } catch (e) {
      console.warn("[bookmark] deleteNewsDoc failed", e);
    }
    return NextResponse.json({ bookmarked: false, doc_id: null });
  }

  // Add bookmark
  const { error: bmErr } = await admin
    .from("news_bookmarks")
    .insert({ user_id: session.userId, article_id: id });
  if (bmErr) return NextResponse.json({ error: bmErr.message }, { status: 500 });

  // Sync-create doc in 「新闻收藏」category
  const { data: article } = await admin
    .from("news_feed")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!article) {
    return NextResponse.json({ bookmarked: true, doc_id: null });
  }

  try {
    const categoryId = await ensureNewsCategory(admin, session.userId);
    const docId = await upsertNewsDoc(admin, {
      userId: session.userId,
      categoryId,
      article: {
        id: article.id,
        title: article.title,
        content: article.content ?? "",
        summary: article.summary ?? null,
        source_url: article.source_url,
        source_name: article.source_name,
        image_url: article.image_url,
        tags: article.tags,
        published_at: article.published_at,
      },
    });
    return NextResponse.json({ bookmarked: true, doc_id: docId });
  } catch (e) {
    console.warn("[bookmark] upsertNewsDoc failed", e);
    return NextResponse.json({ bookmarked: true, doc_id: null });
  }
}
