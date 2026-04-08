import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { embedTexts } from "@/lib/persona-rag/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
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
    .eq("user_id", gate.session.userId)
    .maybeSingle();
  if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: notes, error: le } = await supabase
    .from("persona_notes")
    .select("id, title, body")
    .eq("persona_id", personaId);

  if (le) return NextResponse.json({ error: le.message }, { status: 500 });
  if (!notes?.length) return NextResponse.json({ updated: 0 });

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(notes.map((n) => `${n.title}\n${n.body}`));
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

  for (let i = 0; i < notes.length; i++) {
    const { error: upErr } = await supabase
      .from("persona_notes")
      .update({ embedding: embeddings[i] })
      .eq("id", notes[i].id)
      .eq("user_id", gate.session.userId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ updated: notes.length });
}
