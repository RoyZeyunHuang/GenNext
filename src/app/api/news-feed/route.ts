import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getPersonaOverlay } from "@/lib/news-persona-overlay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apply persona overlay to an article row.
 *
 * 优先级：
 *   1. DB 里的 persona_* 五列（走完黑魔法 RAG 后由 ingest/backfill 写入）
 *   2. JSON 静态 overlay（老数据兜底，hand-curated 24 条）
 *   3. 返回原始新闻（无 overlay）
 */
function applyOverlay(a: Record<string, unknown>): Record<string, unknown> {
  const personaName = typeof a.persona_name === "string" ? a.persona_name : null;
  const personaTitle = typeof a.persona_title === "string" ? a.persona_title : null;
  const personaBody = typeof a.persona_body === "string" ? a.persona_body : null;

  // 1. DB 列优先
  if (personaName && personaTitle && personaBody) {
    return {
      ...a,
      title: personaTitle,
      summary: personaBody.slice(0, 200),
      source_name: personaName,
      persona_name: personaName,
      persona_id: typeof a.persona_id === "string" ? a.persona_id : null,
      persona_angle: typeof a.persona_angle === "string" ? a.persona_angle : null,
      image_url: null,
    };
  }

  // 2. JSON 静态 overlay 兜底
  const overlay = getPersonaOverlay(a.id as string);
  if (overlay) {
    return {
      ...a,
      title: overlay.title,
      summary: overlay.body.slice(0, 200),
      source_name: overlay.persona_name,
      persona_name: overlay.persona_name,
      persona_id: overlay.persona_id,
      persona_angle: overlay.angle,
      image_url: null,
    };
  }

  // 3. 原始新闻
  return a;
}

const NEWS_FEED_SELECT =
  "id, title, summary, source_name, image_url, tags, published_at, created_at, persona_name, persona_id, persona_title, persona_body, persona_angle";

/**
 * GET /api/news-feed
 * 获取新闻列表（分页）
 * Query: page=1, limit=20, tag=xxx, bookmarked=true
 */
export async function GET(req: NextRequest) {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
  const tag = searchParams.get("tag")?.trim() || "";
  const bookmarked = searchParams.get("bookmarked") === "true";

  if (bookmarked) {
    const { data: bms, error: be } = await supabase
      .from("news_bookmarks")
      .select("article_id")
      .eq("user_id", session.userId);
    if (be) return NextResponse.json({ error: be.message }, { status: 500 });

    const articleIds = (bms ?? []).map((b) => b.article_id as string);
    if (articleIds.length === 0) {
      return NextResponse.json({ articles: [], total: 0, page, limit });
    }

    let q = supabase
      .from("news_feed")
      .select(NEWS_FEED_SELECT, { count: "exact" })
      .in("id", articleIds)
      .order("published_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (tag) q = q.contains("tags", [tag]);

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      articles: (data ?? []).map((a) => applyOverlay({ ...a, bookmarked: true })),
      total: count ?? 0,
      page,
      limit,
    });
  }

  // Normal feed
  let q = supabase
    .from("news_feed")
    .select(NEWS_FEED_SELECT, { count: "exact" })
    .order("published_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (tag) q = q.contains("tags", [tag]);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const articleIds = (data ?? []).map((a) => a.id as string);
  let bookmarkSet = new Set<string>();
  if (articleIds.length > 0) {
    const { data: bms } = await supabase
      .from("news_bookmarks")
      .select("article_id")
      .eq("user_id", session.userId)
      .in("article_id", articleIds);
    bookmarkSet = new Set((bms ?? []).map((b) => b.article_id as string));
  }

  const articles = (data ?? []).map((a) =>
    applyOverlay({ ...a, bookmarked: bookmarkSet.has(a.id as string) })
  );

  // First page: boost up to 3 persona articles to the top for visibility
  if (page === 1) {
    const persona: typeof articles = [];
    const normal: typeof articles = [];
    for (const a of articles) {
      if (a.persona_name && persona.length < 3) persona.push(a);
      else normal.push(a);
    }
    return NextResponse.json({
      articles: [...persona, ...normal],
      total: count ?? 0,
      page,
      limit,
    });
  }

  return NextResponse.json({ articles, total: count ?? 0, page, limit });
}
