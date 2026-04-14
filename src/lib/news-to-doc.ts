import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 新闻收藏 → 素材库 Doc 同步
 * 用户在新闻页收藏文章时，自动在其「新闻收藏」分类下创建一篇 doc；
 * 取消收藏时同步删除。这样 copywriter RAG 知识库下拉就能直接选到。
 */

export const NEWS_CATEGORY_NAME = "新闻收藏";

type NewsArticle = {
  id: string;
  title: string;
  content: string | null;
  summary: string | null;
  source_url: string | null;
  source_name: string | null;
  image_url: string | null;
  tags: string[] | null;
  published_at: string;
};

/** 找到 / 创建当前用户的「新闻收藏」分类，返回 category_id */
export async function ensureNewsCategory(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: existing } = await admin
    .from("doc_categories")
    .select("id")
    .eq("owner_id", userId)
    .eq("name", NEWS_CATEGORY_NAME)
    .is("team_id", null)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await admin
    .from("doc_categories")
    .insert({
      name: NEWS_CATEGORY_NAME,
      owner_id: userId,
      icon: "📰",
      description: "从新闻推送收藏的文章（可在黑魔法里作为知识库使用）",
      sort_order: 100,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "创建新闻收藏分类失败");
  }
  return created.id as string;
}

/** 为收藏的新闻创建 doc（如已存在则返回旧的 id）。metadata.news_id 作为幂等键。 */
export async function upsertNewsDoc(
  admin: SupabaseClient,
  opts: {
    userId: string;
    categoryId: string;
    article: NewsArticle;
  }
): Promise<string> {
  const { userId, categoryId, article } = opts;

  // 幂等查找
  const { data: existing } = await admin
    .from("docs")
    .select("id")
    .eq("owner_id", userId)
    .filter("metadata->>news_id", "eq", article.id)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await admin
    .from("docs")
    .insert({
      category_id: categoryId,
      owner_id: userId,
      title: article.title,
      content: article.content ?? "",
      tags: Array.isArray(article.tags) ? article.tags : [],
      metadata: {
        news_id: article.id,
        source_url: article.source_url,
        source_name: article.source_name,
        image_url: article.image_url,
        published_at: article.published_at,
        summary: article.summary,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "创建新闻 doc 失败");
  }
  return data.id as string;
}

/** 根据 news_id 删除该用户对应的 doc（无对应记录则静默） */
export async function deleteNewsDoc(
  admin: SupabaseClient,
  userId: string,
  newsId: string
): Promise<void> {
  await admin
    .from("docs")
    .delete()
    .eq("owner_id", userId)
    .filter("metadata->>news_id", "eq", newsId);
}

/** 查询某条新闻对应的 doc_id（若用户已收藏） */
export async function findNewsDocId(
  admin: SupabaseClient,
  userId: string,
  newsId: string
): Promise<string | null> {
  const { data } = await admin
    .from("docs")
    .select("id")
    .eq("owner_id", userId)
    .filter("metadata->>news_id", "eq", newsId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
