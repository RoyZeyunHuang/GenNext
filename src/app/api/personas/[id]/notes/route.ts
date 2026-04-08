import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { embedTexts } from "@/lib/persona-rag/embeddings";
import { parsePersonaNotesCsv } from "@/lib/persona-rag/csv-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensurePersonaOwned(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  personaId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.from("personas").select("id").eq("id", personaId).eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  const { id: personaId } = await params;
  const supabase = createSupabaseServerClient();
  if (!(await ensurePersonaOwned(supabase, personaId, gate.session.userId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("persona_notes")
    .select("id, persona_id, title, body, metadata, created_at")
    .eq("persona_id", personaId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  const { id: personaId } = await params;
  const supabase = createSupabaseServerClient();
  if (!(await ensurePersonaOwned(supabase, personaId, gate.session.userId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  type NoteIn = { title: string; body: string; metadata?: Record<string, unknown> };
  let notes: NoteIn[] = [];

  if (typeof body.csv === "string" && body.csv.trim()) {
    try {
      notes = parsePersonaNotesCsv(body.csv).map((r) => ({
        title: r.title,
        body: r.body,
        metadata: r.metadata,
      }));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "CSV 解析失败" },
        { status: 400 }
      );
    }
    if (notes.length === 0) {
      return NextResponse.json(
        {
          error:
            "CSV 中没有有效数据行：除表头外请至少有一行，且每行「笔记标题」「笔记文案」均不能为空",
        },
        { status: 400 }
      );
    }
  } else if (Array.isArray(body.notes)) {
    for (const n of body.notes) {
      if (!n || typeof n !== "object") continue;
      const title = typeof (n as NoteIn).title === "string" ? (n as NoteIn).title.trim() : "";
      const rawBody = typeof (n as NoteIn).body === "string" ? (n as NoteIn).body.trim() : "";
      if (!title && !rawBody) continue;
      if (!title || !rawBody) {
        return NextResponse.json(
          { error: "每条笔记须同时填写「笔记标题」与「笔记文案」，不能为空" },
          { status: 400 }
        );
      }
      notes.push({
        title,
        body: rawBody,
        metadata:
          (n as NoteIn).metadata && typeof (n as NoteIn).metadata === "object"
            ? (n as NoteIn).metadata
            : {},
      });
    }
  }

  if (notes.length === 0) {
    return NextResponse.json({ error: "请提供 notes 数组或 csv 字符串" }, { status: 400 });
  }

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

  const rows = notes.map((n, i) => ({
    persona_id: personaId,
    user_id: gate.session.userId,
    title: n.title,
    body: n.body,
    embedding: embeddings[i],
    metadata: n.metadata ?? {},
  }));

  const { data, error } = await supabase.from("persona_notes").insert(rows).select("id, title, body, metadata, created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: data?.length ?? 0, rows: data ?? [] });
}
