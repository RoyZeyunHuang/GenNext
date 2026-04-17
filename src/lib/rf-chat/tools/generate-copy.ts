import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canReadPersona } from "@/lib/persona-access";
import { embedText } from "@/lib/persona-rag/embeddings";
import { buildPersonaSystemPrompt } from "@/lib/persona-rag/prompt";
import {
  PERSONA_RETRIEVE_FINAL_K,
  classifyRetrievalMode,
  normalizePersonaRpcRows,
} from "@/lib/persona-rag/retrieve-threshold";
import { tryConsumePersonaGenerateSlot, getPersonaGenerateWeeklyLimit } from "@/lib/persona-generate-quota";
import {
  normalizeArticleLength,
  maxTokensForBodyStream,
  type ArticleLength,
} from "@/lib/copy-generate-options";
import {
  normalizePersonaContentKind,
  type PersonaContentKind,
} from "@/lib/persona-rag/content-kind";
import {
  alreadyDone,
  ambiguous,
  invalidInput,
  notFound,
  ok,
  permissionDenied,
  quotaExhausted,
  toolError,
  type Tool,
} from "../types";
import { resolveBuilding, resolvePersona, type ResolvedBuilding } from "../resolvers";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

type Input = {
  persona?: string;
  user_prompt?: string;
  building?: string;
  content_kind?: string;
  article_length?: string;
};

export const generateCopyTool: Tool<Input> = {
  name: "generate_copy",
  description:
    "⚠️ 扣 1 次黑魔法周额度。用指定人格（可选指定楼盘）生成小红书/Instagram/口播文案。单次对话最多调一次，服务端强制。参数全都接受自然语言：persona 可传 name 或 id；building 可传 name / slug / id。返回 status=ok 时 data.generated 就是完整文案，**原样展示给用户**。",
  input_schema: {
    type: "object" as const,
    properties: {
      persona: { type: "string", description: "人格名或 id（必填）" },
      user_prompt: { type: "string", description: "用户的具体诉求（必填）" },
      building: { type: "string", description: "可选：楼盘名/slug/id" },
      content_kind: {
        type: "string",
        enum: ["xiaohongshu", "instagram", "oral"],
        description: "默认 xiaohongshu",
      },
      article_length: {
        type: "string",
        enum: ["short", "medium", "long", "extra_long"],
        description: "默认 medium",
      },
    },
    required: ["persona", "user_prompt"],
  },
  async execute(input, ctx) {
    // 单次请求硬限 1 次（防刷额度 + 防 AI 死循环）
    if (ctx.generateCopyFirstResult) {
      return alreadyDone(
        "本轮对话已经生成过文案。请把上次的结果原样展示给用户。如果用户明确要换版本，让他下一句说「再来一版」「换个风格」等，会话轮转时再调。",
        ctx.generateCopyFirstResult
      );
    }

    const personaKey = (input.persona ?? "").trim();
    const userPrompt = (input.user_prompt ?? "").trim();
    if (!personaKey || !userPrompt) {
      return invalidInput("persona 和 user_prompt 必填");
    }

    // 1. 解析 persona（容错 name/id）
    const pRes = await resolvePersona(personaKey, { userId: ctx.userId });
    if (pRes.kind === "not_found") {
      const result = notFound(
        `人格「${personaKey}」`,
        "用户可能说的人格不存在，或者你拼错了。建议先 list_personas 让用户从可用人格里挑。"
      );
      ctx.generateCopyFirstResult = result;
      return result;
    }
    if (pRes.kind === "ambiguous") {
      const result = ambiguous(
        pRes.candidates,
        "多个同名人格。用 ask_user 让用户在 candidates 里挑一个，拿到 label 再调 generate_copy。"
      );
      ctx.generateCopyFirstResult = result;
      return result;
    }
    const persona = pRes.persona;

    // 2. 权限
    const sess = {
      userId: ctx.userId,
      email: ctx.email,
      isAdmin: ctx.isAdmin,
      hasMainAccess: ctx.hasMainAccess,
      personaGenerateUnlimited: ctx.personaGenerateUnlimited,
      rfApproved: true,
    };
    if (
      !canReadPersona(sess, {
        user_id: persona.user_id ?? "",
        is_public: persona.is_public,
      })
    ) {
      const result = permissionDenied(`你无权使用人格「${persona.name ?? personaKey}」`);
      ctx.generateCopyFirstResult = result;
      return result;
    }

    // 3. 可选 building
    let knowledgeContent: string | undefined;
    let buildingSummary: { name: string; slug: string | null; area: string } | null = null;
    const buildingKey = (input.building ?? "").trim();
    if (buildingKey) {
      const bRes = await resolveBuilding(buildingKey);
      if (bRes.kind === "not_found") {
        const result = notFound(
          `楼盘「${buildingKey}」`,
          "楼盘没找到，让用户换个说法，或调 search_buildings 先浏览。"
        );
        ctx.generateCopyFirstResult = result;
        return result;
      }
      if (bRes.kind === "ambiguous") {
        const result = ambiguous(
          bRes.candidates,
          "多个楼盘名相似。用 ask_user 让用户挑一个 label，再把 label 作为 building 传回。"
        );
        ctx.generateCopyFirstResult = result;
        return result;
      }
      const b = bRes.building;
      const admin = getSupabaseAdmin();
      const { data: listings } = await admin
        .from("apt_listings")
        .select(
          "unit, price_monthly, bedrooms, bathrooms, sqft, months_free, available_at"
        )
        .eq("building_id", b.id)
        .eq("is_active", true)
        .limit(60);
      knowledgeContent = renderBuildingFacts(b, (listings ?? []) as Array<{
        unit: string | null;
        price_monthly: number | null;
        bedrooms: number | null;
        bathrooms: number | null;
        sqft: number | null;
        months_free: number | null;
        available_at: string | null;
      }>);
      buildingSummary = {
        name: b.name,
        slug: b.building_slug,
        area: b.area,
      };
    }

    // 4. 额度
    if (!ctx.personaGenerateUnlimited) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const result = toolError("服务未配置 SUPABASE_SERVICE_ROLE_KEY，额度无法校验");
        ctx.generateCopyFirstResult = result;
        return result;
      }
      const slot = await tryConsumePersonaGenerateSlot(ctx.userId);
      if (slot === null) {
        const result = toolError("额度校验失败");
        ctx.generateCopyFirstResult = result;
        return result;
      }
      if (!slot.allowed) {
        const result = quotaExhausted(slot.limit ?? getPersonaGenerateWeeklyLimit());
        ctx.generateCopyFirstResult = result;
        return result;
      }
    }

    // 5. Persona notes RAG
    const retrievedNotes: { title: string; body: string }[] = [];
    let retrievalMode = classifyRetrievalMode(0);
    try {
      const emb = await embedText(userPrompt);
      const admin = getSupabaseAdmin();
      const { data: candidates } = await admin.rpc("match_persona_notes", {
        p_persona_id: persona.id,
        p_query_embedding: emb,
        p_match_count: PERSONA_RETRIEVE_FINAL_K,
      });
      const norm = normalizePersonaRpcRows(candidates, PERSONA_RETRIEVE_FINAL_K);
      for (const n of norm) retrievedNotes.push({ title: n.title, body: n.body });
      const maxScore = Number(norm[0]?.similarity ?? 0);
      retrievalMode = classifyRetrievalMode(maxScore);
    } catch {
      /* embedding 失败就不走 RAG */
    }

    // 6. 组 prompt → Claude
    const contentKind: PersonaContentKind = normalizePersonaContentKind(input.content_kind);
    const articleLength: ArticleLength = normalizeArticleLength(input.article_length);
    const systemPrompt = buildPersonaSystemPrompt({
      personaBio: persona.bio_md || "",
      retrievedNotes,
      retrievalMode,
      knowledgeContent,
      articleLengthRaw: articleLength,
      contentKind,
    });

    try {
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokensForBodyStream(articleLength, "body_first"),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const result = ok(
        {
          generated: text,
          persona_name: persona.name ?? "",
          building: buildingSummary,
          content_kind: contentKind,
          notes_used: retrievedNotes.length,
        },
        {
          hint: "直接把 data.generated **原样**贴给用户。前面最多加一句「你看这版：」。不要复述/压缩/重写。",
        }
      );
      ctx.generateCopyFirstResult = result;
      return result;
    } catch (e) {
      const result = toolError(e instanceof Error ? e.message : String(e));
      ctx.generateCopyFirstResult = result;
      return result;
    }
  },
};

function renderBuildingFacts(
  b: ResolvedBuilding,
  listings: Array<{
    unit: string | null;
    price_monthly: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    months_free: number | null;
    available_at: string | null;
  }>
): string {
  const lines: string[] = [];
  lines.push(`### 楼盘：${b.name}${b.short_name ? ` (${b.short_name})` : ""}`);
  if (b.address) lines.push(`- 地址：${b.address}`);
  if (b.neighborhood) lines.push(`- 社区：${b.neighborhood}`);
  if (b.year_built) lines.push(`- 建成年份：${b.year_built}`);
  if (b.amenities && b.amenities.length)
    lines.push(`- Amenities：${b.amenities.join("、")}`);
  if (Array.isArray(b.subways) && b.subways.length > 0) {
    const subs = (b.subways as Array<{ name: string; routes: string[]; distance?: number }>)
      .slice(0, 5)
      .map((s) => `${s.name}(${(s.routes ?? []).join("/")})${s.distance ? ` ${s.distance}m` : ""}`)
      .join("，");
    lines.push(`- 地铁：${subs}`);
  }
  if (Array.isArray(b.schools) && b.schools.length > 0) {
    const schools = (b.schools as Array<{ name: string; district?: string }>)
      .slice(0, 3)
      .map((s) => `${s.name}${s.district ? ` (${s.district})` : ""}`)
      .join("、");
    lines.push(`- 学校：${schools}`);
  }
  if (b.description) lines.push(`- 官方描述：${b.description.slice(0, 500)}`);
  if (listings.length) {
    const bedGroups = new Map<string, { min: number; max: number; count: number }>();
    for (const l of listings) {
      if (l.price_monthly == null) continue;
      const bedKey =
        l.bedrooms == null ? "未知" : l.bedrooms === 0 ? "Studio" : `${l.bedrooms}Bed`;
      const prev = bedGroups.get(bedKey);
      if (prev) {
        prev.min = Math.min(prev.min, l.price_monthly);
        prev.max = Math.max(prev.max, l.price_monthly);
        prev.count += 1;
      } else {
        bedGroups.set(bedKey, { min: l.price_monthly, max: l.price_monthly, count: 1 });
      }
    }
    lines.push(`- 活跃 listing：共 ${listings.length} 套`);
    for (const [bed, v] of Array.from(bedGroups.entries())) {
      const range = v.min === v.max ? `$${v.min}` : `$${v.min}–$${v.max}`;
      lines.push(`  · ${bed}: ${v.count} 套，${range}`);
    }
    const hasMonthsFree = listings.some((l) => l.months_free && l.months_free > 0);
    if (hasMonthsFree) {
      const maxFree = Math.max(...listings.map((l) => l.months_free ?? 0));
      lines.push(`  · 最多免 ${maxFree} 个月`);
    }
  } else {
    lines.push(`- 当前无活跃 listing`);
  }
  return lines.join("\n");
}
