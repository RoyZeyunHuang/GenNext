/**
 * 新闻入库 → 虚拟人笔记自动生成 pipeline
 *
 * 与线上 /api/ai/persona-generate 完全一致的黑魔法 RAG 链路：
 *   1. AI 看标题/摘要/标签 → 选角度（share/experience/market）+ 选人格
 *   2. OpenAI text-embedding-3-small 对 (angle prompt + 新闻) 做 embedding
 *   3. Supabase RPC match_persona_notes 检索 Top-3 笔记范文
 *   4. buildPersonaSystemPrompt（含 bio + 范文 + 新闻原文作为 knowledge）
 *   5. Claude sonnet 生成虚拟人版本标题 + 正文
 *   6. 写回 news_feed.persona_* 五列
 *
 * 入口：generateOverlaysForArticles(admin, articles, opts) — 逐条容错，不会因一条失败阻塞其他
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/persona-rag/embeddings";
import { buildPersonaSystemPrompt } from "@/lib/persona-rag/prompt";
import {
  PERSONA_RETRIEVE_FINAL_K,
  classifyRetrievalMode,
  normalizePersonaRpcRows,
} from "@/lib/persona-rag/retrieve-threshold";

export type NewsArticleForOverlay = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  source_name: string | null;
  tags: string[] | null;
  published_at?: string | null;
};

type PersonaRow = {
  id: string;
  name: string;
  short_description: string | null;
  bio_md: string | null;
};

type Angle = "share" | "experience" | "market";

const ANGLE_PROMPTS: Record<Angle, { label: string; text: string }> = {
  share: { label: "分享新闻资讯", text: "写一篇分享以下新闻资讯的笔记" },
  experience: { label: "亲历活动/体验", text: "我参加了这个活动，写一篇笔记分享我的经历" },
  market: { label: "给客户的市场观察", text: "基于这条新闻写一篇给客户的市场观察/解读笔记" },
};

type Decision = {
  index: number; // 1-based
  angle: Angle;
  persona_id: string;
  reason?: string;
};

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function anthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

/** 获取可用的"公共"人格（用于给新闻自动匹配写手） */
export async function fetchPublicPersonasForOverlay(
  admin: SupabaseClient
): Promise<PersonaRow[]> {
  // 优先 visibility='public'；兼容老数据 is_public=true
  const { data, error } = await admin
    .from("personas")
    .select("id, name, short_description, bio_md, visibility, is_public")
    .or("visibility.eq.public,is_public.eq.true");
  if (error) throw new Error(`fetchPublicPersonasForOverlay: ${error.message}`);
  const rows = (data ?? []) as (PersonaRow & {
    visibility?: string | null;
    is_public?: boolean | null;
  })[];
  return rows
    .filter((p) => (p.bio_md ?? "").trim().length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      short_description: p.short_description,
      bio_md: p.bio_md,
    }));
}

/** 批量让 AI 决策每条新闻的 angle + persona_id */
async function pickDecisions(
  articles: NewsArticleForOverlay[],
  personas: PersonaRow[]
): Promise<Decision[]> {
  const anthropic = anthropicClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY not set");

  const personaSummaries = personas
    .map(
      (p) =>
        `- ID: ${p.id} | 名字: ${p.name} | 简介: ${(p.short_description || "").slice(0, 150)}`
    )
    .join("\n");

  const batchPrompt = articles
    .map(
      (a, i) =>
        `[${i + 1}] 标题: ${a.title}\n    标签: ${(a.tags || []).join(", ") || "无"}\n    来源: ${a.source_name || "未知"}\n    摘要: ${(a.summary || a.content || "").slice(0, 200)}`
    )
    .join("\n\n");

  const system = `你是一个社媒内容策划专家。为每条新闻选写作角度和人格。

可用写作角度（3选1）：
- share: 分享新闻资讯——把新闻重点信息转化成小红书笔记
- experience: 亲历活动/体验——我去了/参加了，分享真实经历（仅适合活动、事件、地点类新闻）
- market: 给客户的市场观察——地产/政策/市场类新闻，专业解读给客户看

可用人格：
${personaSummaries}

选择原则：
- 地产市场/政策类 → market 角度，选擅长地产专业分析的人格
- 活动/美食/生活方式类 → experience 角度，选生活化/年轻的人格
- 一般性新闻/行业消息 → share 角度，按新闻调性匹配人格
- 每个人格尽量被均匀使用

输出 JSON 数组: [{ "index": 数字, "angle": "share"|"experience"|"market", "persona_id": "UUID", "reason": "简短理由" }]
只输出 JSON。`;

  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system,
    messages: [
      {
        role: "user",
        content: `请为以下 ${articles.length} 条新闻分配:\n\n${batchPrompt}`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const raw = jsonMatch ? jsonMatch[0] : text;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("AI decisions: not an array");

  const personaIds = new Set(personas.map((p) => p.id));
  const out: Decision[] = [];
  for (const d of parsed) {
    if (!d || typeof d !== "object") continue;
    const rec = d as Record<string, unknown>;
    const index = Number(rec.index);
    const angle = rec.angle;
    const personaId = typeof rec.persona_id === "string" ? rec.persona_id : "";
    if (!Number.isInteger(index) || index < 1 || index > articles.length) continue;
    if (angle !== "share" && angle !== "experience" && angle !== "market") continue;
    if (!personaIds.has(personaId)) continue;
    out.push({
      index,
      angle: angle as Angle,
      persona_id: personaId,
      reason: typeof rec.reason === "string" ? rec.reason : undefined,
    });
  }
  return out;
}

/** 单篇文章：走完整黑魔法 RAG → Claude → 解析出 title+body；不写 DB */
async function generateOverlayForOne(
  admin: SupabaseClient,
  article: NewsArticleForOverlay,
  persona: PersonaRow,
  angle: Angle
): Promise<{ title: string; body: string }> {
  const anthropic = anthropicClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY not set");

  const anglePrompt = ANGLE_PROMPTS[angle];
  const newsBlock = `${anglePrompt.text}\n\n新闻标题: ${article.title}\n新闻来源: ${article.source_name || "未知"}\n新闻内容:\n${(article.content || article.summary || "").slice(0, 2000)}`;

  // 1. Embedding
  const queryEmbedding = await embedText(newsBlock);

  // 2. 检索 Top-3 同人格笔记
  const { data: candidates, error: rpcErr } = await admin.rpc("match_persona_notes", {
    p_persona_id: persona.id,
    p_query_embedding: queryEmbedding,
    p_match_count: PERSONA_RETRIEVE_FINAL_K,
  });
  if (rpcErr) throw new Error(`match_persona_notes: ${rpcErr.message}`);

  const retrievedNotes = normalizePersonaRpcRows(candidates, PERSONA_RETRIEVE_FINAL_K);
  const maxScore = Number(retrievedNotes[0]?.similarity ?? 0);
  const retrievalMode = classifyRetrievalMode(maxScore);

  // 3. 新闻原文作为「知识内容」注入
  const knowledgeContent = `### ${article.title}\n${(article.content || article.summary || "").slice(0, 3000)}`;

  const systemPrompt = buildPersonaSystemPrompt({
    personaBio: persona.bio_md || "",
    retrievedNotes: retrievedNotes.map((n) => ({ title: n.title, body: n.body })),
    retrievalMode,
    knowledgeContent,
    articleLengthRaw: "long",
    contentKind: "xiaohongshu",
  });

  // 4. Claude 生成
  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: anglePrompt.text }],
  });

  const noteText = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // 5. 解析 title + body（首行是标题，空行后是正文）
  const lines = noteText.split(/\r?\n/);
  const titleLine = (lines[0] || "").replace(/^#+\s*/, "").trim();
  const body = lines.slice(1).join("\n").replace(/^\n+/, "").trim();

  if (!titleLine || !body) {
    throw new Error("生成结果解析失败（未拆出 title/body）");
  }
  return { title: titleLine, body };
}

export type OverlayBatchResult = {
  succeeded: { id: string; persona_name: string; angle: Angle }[];
  failed: { id: string; error: string }[];
  skipped: { id: string; reason: string }[];
};

/**
 * 对一批文章生成虚拟人笔记并写回 DB。
 * - 逐条容错：单条失败不影响其他
 * - 已有 persona_* 的文章自动跳过（幂等）
 */
export async function generateOverlaysForArticles(
  admin: SupabaseClient,
  articles: NewsArticleForOverlay[],
  opts?: { maxCount?: number }
): Promise<OverlayBatchResult> {
  const result: OverlayBatchResult = { succeeded: [], failed: [], skipped: [] };

  if (articles.length === 0) return result;
  if (!process.env.OPENAI_API_KEY) {
    return {
      succeeded: [],
      failed: [],
      skipped: articles.map((a) => ({ id: a.id, reason: "OPENAI_API_KEY missing" })),
    };
  }
  if (!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)) {
    return {
      succeeded: [],
      failed: [],
      skipped: articles.map((a) => ({ id: a.id, reason: "ANTHROPIC_API_KEY missing" })),
    };
  }

  // 截取处理上限（避免 ingest 瞬间涌入大量，Vercel 30s 超时风险）
  const toProcess = opts?.maxCount ? articles.slice(0, opts.maxCount) : articles;

  // 1. 取公共人格池
  let personas: PersonaRow[];
  try {
    personas = await fetchPublicPersonasForOverlay(admin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      succeeded: [],
      failed: [],
      skipped: toProcess.map((a) => ({ id: a.id, reason: `无法拉取人格: ${msg}` })),
    };
  }
  if (personas.length === 0) {
    return {
      succeeded: [],
      failed: [],
      skipped: toProcess.map((a) => ({ id: a.id, reason: "无可用公共人格" })),
    };
  }

  // 2. AI 批量决策 angle + persona
  let decisions: Decision[];
  try {
    decisions = await pickDecisions(toProcess, personas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      succeeded: [],
      failed: [],
      skipped: toProcess.map((a) => ({ id: a.id, reason: `AI 决策失败: ${msg}` })),
    };
  }

  const personaById = new Map(personas.map((p) => [p.id, p]));

  // 3. 逐条生成 + 写回
  for (const d of decisions) {
    const article = toProcess[d.index - 1];
    if (!article) continue;
    const persona = personaById.get(d.persona_id);
    if (!persona) {
      result.failed.push({ id: article.id, error: `persona ${d.persona_id} not found` });
      continue;
    }

    try {
      const { title, body } = await generateOverlayForOne(admin, article, persona, d.angle);
      const { error: upErr } = await admin
        .from("news_feed")
        .update({
          persona_name: persona.name,
          persona_id: persona.id,
          persona_title: title,
          persona_body: body,
          persona_angle: d.angle,
        })
        .eq("id", article.id);
      if (upErr) {
        result.failed.push({ id: article.id, error: `update: ${upErr.message}` });
        continue;
      }
      result.succeeded.push({ id: article.id, persona_name: persona.name, angle: d.angle });
    } catch (e) {
      result.failed.push({
        id: article.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // AI 未决策的文章也归入 skipped
  const decidedIds = new Set(
    decisions.map((d) => toProcess[d.index - 1]?.id).filter(Boolean) as string[]
  );
  for (const a of toProcess) {
    if (!decidedIds.has(a.id)) {
      result.skipped.push({ id: a.id, reason: "AI 未选中" });
    }
  }

  return result;
}
