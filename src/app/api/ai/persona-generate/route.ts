import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { maxTokensForBodyStream, normalizeArticleLength } from "@/lib/copy-generate-options";
import { normalizePersonaContentKind } from "@/lib/persona-rag/content-kind";
import { embedText } from "@/lib/persona-rag/embeddings";
import { digestNotesForDna } from "@/lib/persona-rag/note-digest";
import { buildPersonaSystemPromptDna } from "@/lib/persona-rag/prompt-dna";
import { buildPersonaSystemPrompt } from "@/lib/persona-rag/prompt";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { canReadPersona } from "@/lib/persona-access";
import {
  PERSONA_RETRIEVE_FINAL_K,
  classifyRetrievalMode,
  normalizePersonaRpcRows,
} from "@/lib/persona-rag/retrieve-threshold";
import { tryConsumePersonaGenerateSlot } from "@/lib/persona-generate-quota";
import { resolvePromptDocRole } from "@/lib/doc-category-constants";
import { recordPersonaRagInvocation } from "@/lib/persona-rag/record-usage";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PersonaRagMode = "legacy" | "dna";

function resolvePersonaRagMode(raw: unknown, isAdmin: boolean): PersonaRagMode {
  if (raw === "dna" && isAdmin) return "dna";
  return "legacy";
}

export async function POST(req: NextRequest) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  if (!anthropic.apiKey) {
    return new Response(JSON.stringify({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const persona_id = typeof body.persona_id === "string" ? body.persona_id.trim() : "";
  const user_input = typeof body.user_input === "string" ? body.user_input.trim() : "";
  const task_template_doc_id =
    typeof body.task_template_doc_id === "string" && body.task_template_doc_id.trim()
      ? body.task_template_doc_id.trim()
      : undefined;
  const knowledge_doc_id =
    typeof body.knowledge_doc_id === "string" && body.knowledge_doc_id.trim()
      ? body.knowledge_doc_id.trim()
      : undefined;
  const separateTitles = body.separate_titles === true;
  const articleLength = normalizeArticleLength(body.article_length);
  const ragMode = resolvePersonaRagMode(body.rag_mode, gate.session.isAdmin);
  const contentKind = normalizePersonaContentKind(body.content_kind);

  if (!persona_id || !user_input) {
    return new Response(JSON.stringify({ error: "persona_id 与 user_input 必填" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: persona, error: pe } = await supabase
    .from("personas")
    .select("id, bio_md, name, user_id, is_public")
    .eq("id", persona_id)
    .maybeSingle();

  if (pe) {
    return new Response(JSON.stringify({ error: pe.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!persona) {
    return new Response(JSON.stringify({ error: "persona not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!canReadPersona(gate.session, persona)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let taskConstraint: string | undefined;
  if (task_template_doc_id) {
    const { data: doc } = await supabase.from("docs").select("content").eq("id", task_template_doc_id).maybeSingle();
    const t = (doc?.content ?? "").trim();
    if (t) taskConstraint = t;
  }

  let knowledgeContent: string | undefined;
  if (knowledge_doc_id) {
    const { data: refDoc } = await supabase
      .from("docs")
      .select("title, content, category_id")
      .eq("id", knowledge_doc_id)
      .maybeSingle();
    if (refDoc?.category_id) {
      const { data: cat } = await supabase
        .from("doc_categories")
        .select("name")
        .eq("id", refDoc.category_id)
        .maybeSingle();
      const role = resolvePromptDocRole(cat?.name, undefined);
      if (role === "reference") {
        const title = (refDoc.title ?? "").trim();
        const content = (refDoc.content ?? "").trim();
        if (content) {
          knowledgeContent = title ? `### ${title}\n${content}` : content;
        }
      }
    }
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(user_input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("OPENAI_API_KEY not set")) {
      return new Response(
        JSON.stringify({ error: "请在 .env.local 设置 OPENAI_API_KEY 来启用 RAG 检索" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: candidates, error: me } = await supabase.rpc("match_persona_notes", {
    p_persona_id: persona_id,
    p_query_embedding: queryEmbedding,
    p_match_count: PERSONA_RETRIEVE_FINAL_K,
  });

  if (me) {
    return new Response(JSON.stringify({ error: me.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const retrievedNotes = normalizePersonaRpcRows(candidates, PERSONA_RETRIEVE_FINAL_K);
  const maxScore = Number(retrievedNotes[0]?.similarity ?? 0);
  const retrievalMode = classifyRetrievalMode(maxScore);

  const rawNotes = retrievedNotes.map((n) => ({ title: n.title, body: n.body }));
  const systemPrompt =
    ragMode === "dna"
      ? buildPersonaSystemPromptDna({
          personaBio: persona.bio_md || "",
          digestedNotes: digestNotesForDna(rawNotes, retrievalMode),
          retrievalMode,
          taskConstraint,
          knowledgeContent,
          bodyOnlyOutput: separateTitles,
          articleLengthRaw: articleLength,
          contentKind,
        })
      : buildPersonaSystemPrompt({
          personaBio: persona.bio_md || "",
          retrievedNotes: rawNotes,
          retrievalMode,
          taskConstraint,
          knowledgeContent,
          bodyOnlyOutput: separateTitles,
          articleLengthRaw: articleLength,
          contentKind,
        });

  if (!gate.session.personaGenerateUnlimited) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY，无法校验黑魔法每日额度" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    const slot = await tryConsumePersonaGenerateSlot(gate.session.userId);
    if (slot === null) {
      return new Response(JSON.stringify({ error: "额度校验失败，请稍后重试" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!slot.allowed) {
      return new Response(
        JSON.stringify({
          error: `今日黑魔法生成次数已用完（每日 ${slot.limit} 次），请明日再试或联系管理员开通不限次`,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const headerPayload = {
    mode: retrievalMode,
    rag_mode: ragMode,
    content_kind: contentKind,
    notes: retrievedNotes.map((n) => ({
      id: n.id,
      title: n.title,
      similarity: Number(Number(n.similarity).toFixed(4)),
    })),
  };

  void recordPersonaRagInvocation(
    persona_id,
    retrievedNotes.map((n) => n.id),
    gate.session.userId
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTokensForBodyStream(articleLength, "body_only"),
          system: systemPrompt,
          messages: [{ role: "user", content: user_input }],
        });
        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta.text
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode("ERROR: " + errMsg));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
      "X-Rag-Mode": ragMode,
      "X-Content-Kind": contentKind,
      "X-Retrieved-Notes": encodeURIComponent(JSON.stringify(headerPayload)),
    },
  });
}
