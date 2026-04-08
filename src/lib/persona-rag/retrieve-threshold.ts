/** 生成链路：固定 Top-3 + classifyRetrievalMode 驱动 prompt。测试检索仍用下方 filter（阈值过滤）。 */

/** 正式生成时 RPC 拉取条数（始终 Top-3，弱匹配改 prompt 而非丢笔记） */
export const PERSONA_RETRIEVE_FINAL_K = 3;

export const STRONG_MATCH_THRESHOLD = 0.55;
export const WEAK_MATCH_THRESHOLD = 0.35;

/** 仅用于 /api/personas/[id]/retrieve：先拉候选池再阈值截取，便于 debug */
export const PERSONA_RETRIEVE_CANDIDATE_K = 10;

export type RetrievalMode = "topic_aligned" | "topic_loose" | "style_only";

export function classifyRetrievalMode(maxScore: number): RetrievalMode {
  if (maxScore >= STRONG_MATCH_THRESHOLD) return "topic_aligned";
  if (maxScore >= WEAK_MATCH_THRESHOLD) return "topic_loose";
  return "style_only";
}

export type PersonaNoteMatch = {
  id: string;
  title: string;
  body: string;
  similarity: number;
};

function toSimilarity(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 将 RPC 行规范为数值 similarity（生成路径用） */
export function normalizePersonaRpcRows(
  rows: unknown,
  maxCount: number
): PersonaNoteMatch[] {
  const arr = Array.isArray(rows) ? rows : [];
  return arr.slice(0, maxCount).map((r: { id: string; title: string; body: string; similarity: unknown }) => ({
    id: r.id,
    title: r.title ?? "",
    body: r.body ?? "",
    similarity: toSimilarity(r.similarity),
  }));
}

/** 与 DB 去重 API 共用：规范化后的标题+正文，用于判断是否同一条笔记 */
export function personaNoteContentKey(title: string, body: string): string {
  const t = title.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  const b = body.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  return `${t}\n${b}`;
}

/** 同一向量候选池内：保留相似度更高者优先（顺序不变，只去掉后出现的同内容） */
function dedupeCandidatesPreservingOrder(rows: PersonaNoteMatch[]): PersonaNoteMatch[] {
  const seen = new Set<string>();
  const out: PersonaNoteMatch[] = [];
  for (const r of rows) {
    const key = personaNoteContentKey(r.title, r.body);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * @deprecated 仅保留给 `/api/personas/[id]/retrieve` 调试：Top-10 去重后按阈值决定 0/2/3 条。
 * 正式生成请用 `PERSONA_RETRIEVE_FINAL_K` + `classifyRetrievalMode`，勿再调用本函数。
 */
export function filterRetrievedBySimilarityThreshold(
  rows: { id: string; title: string; body: string; similarity: unknown }[]
): PersonaNoteMatch[] {
  const top10 = rows.slice(0, PERSONA_RETRIEVE_CANDIDATE_K).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    similarity: toSimilarity(r.similarity),
  }));
  if (top10.length === 0) return [];

  const deduped = dedupeCandidatesPreservingOrder(top10);
  if (deduped.length === 0) return [];

  const maxScore = deduped[0].similarity;
  if (maxScore >= STRONG_MATCH_THRESHOLD) return deduped.slice(0, 3);
  if (maxScore >= WEAK_MATCH_THRESHOLD) return deduped.slice(0, 2);
  return [];
}
