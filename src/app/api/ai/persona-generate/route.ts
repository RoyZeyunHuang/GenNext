import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";
import { maxTokensForBodyStream, normalizeArticleLength } from "@/lib/copy-generate-options";
import { embedText } from "@/lib/persona-rag/embeddings";
import { buildPersonaSystemPrompt } from "@/lib/persona-rag/prompt";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import {
  PERSONA_RETRIEVE_FINAL_K,
  classifyRetrievalMode,
  normalizePersonaRpcRows,
} from "@/lib/persona-rag/retrieve-threshold";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const articleLength = normalizeArticleLength(body.article_length);

  if (!persona_id || !user_input) {
    return new Response(JSON.stringify({ error: "persona_id 与 user_input 必填" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sbUser = createSupabaseServerClient();
  const { data: persona, error: pe } = await sbUser
    .from("personas")
    .select("id, bio_md, name")
    .eq("id", persona_id)
    .eq("user_id", gate.session.userId)
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

  let taskConstraint: string | undefined;
  if (task_template_doc_id) {
    const { data: doc } = await supabase.from("docs").select("content").eq("id", task_template_doc_id).maybeSingle();
    const t = (doc?.content ?? "").trim();
    if (t) taskConstraint = t;
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

  const { data: candidates, error: me } = await sbUser.rpc("match_persona_notes", {
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

  const systemPrompt = buildPersonaSystemPrompt({
    personaBio: persona.bio_md || "",
    retrievedNotes: retrievedNotes.map((n) => ({ title: n.title, body: n.body })),
    retrievalMode,
    taskConstraint,
    articleLengthRaw: articleLength,
  });

  const headerPayload = {
    mode: retrievalMode,
    notes: retrievedNotes.map((n) => ({
      id: n.id,
      title: n.title,
      similarity: Number(Number(n.similarity).toFixed(4)),
    })),
  };

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
      "X-Retrieved-Notes": encodeURIComponent(JSON.stringify(headerPayload)),
    },
  });
}
