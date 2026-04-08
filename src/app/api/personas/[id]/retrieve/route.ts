import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { embedText } from "@/lib/persona-rag/embeddings";
import {
  filterRetrievedBySimilarityThreshold,
  PERSONA_RETRIEVE_CANDIDATE_K,
} from "@/lib/persona-rag/retrieve-threshold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  const { id: personaId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: persona } = await supabase
    .from("personas")
    .select("id")
    .eq("id", personaId)
    .maybeSingle();
  if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ error: "query 必填" }, { status: 400 });
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(query);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("OPENAI_API_KEY")) {
      return NextResponse.json(
        { error: "请在 .env.local 设置 OPENAI_API_KEY 来启用 RAG 检索" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { data: rows, error } = await supabase.rpc("match_persona_notes", {
    p_persona_id: personaId,
    p_query_embedding: queryEmbedding,
    p_match_count: PERSONA_RETRIEVE_CANDIDATE_K,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtered = filterRetrievedBySimilarityThreshold(
    (rows ?? []) as { id: string; title: string; body: string; similarity: number }[]
  );

  return NextResponse.json({
    matches: filtered.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      similarity: r.similarity,
    })),
  });
}
