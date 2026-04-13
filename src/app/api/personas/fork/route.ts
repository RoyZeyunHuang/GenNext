import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { canReadPersona } from "@/lib/persona-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

const MODEL = "claude-sonnet-4-20250514";

const MERGE_SYSTEM = `你是人设档案编辑专家。用户会给你：
1. 一份已有的人设档案（Markdown 格式的 bio）
2. 用户想要做的定制化调整（自然语言描述）

你的任务：把用户的调整融合进原始档案，输出一份**完整的新档案**。

规则：
- 保留原始档案的结构和格式（Markdown）
- 用户明确要改的地方就改，没提到的保持原样
- 改动要自然融入，不要留下"根据用户要求修改了…"之类的元描述
- 只输出最终档案正文，不要任何前缀说明`;

async function mergeBio(
  originalBio: string,
  customizations: string
): Promise<string> {
  const userMsg =
    `## 原始人设档案\n\n${originalBio.trim()}\n\n` +
    `## 用户的定制化调整\n\n${customizations.trim()}`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: MERGE_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const block = res.content[0];
  const text = block && block.type === "text" ? block.text : "";
  if (!text.trim()) throw new Error("模型未返回有效文本");
  return text.trim();
}

async function generateShortDescription(
  name: string,
  bioMd: string
): Promise<string> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: `你是中文角色文案编辑。用户给你一个人设的名字和完整角色档案。
用这个人自己的口吻，写恰好一句中文自我介绍。
必须第一人称，一句到底，不换行，不分点，不用 Markdown。
语气用词符合档案人设。只输出正文。`,
    messages: [
      {
        role: "user",
        content: `名字：${name}\n\n角色档案：\n${bioMd || "（档案为空）"}`,
      },
    ],
  });
  const block = res.content[0];
  const text = block && block.type === "text" ? block.text : "";
  return text
    .trim()
    .replace(/^["「『]|["」』]$/g, "")
    .split(/\n/)[0]
    ?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    if (!anthropic.apiKey) {
      return NextResponse.json(
        { error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sourceId =
      typeof body.source_persona_id === "string"
        ? body.source_persona_id.trim()
        : "";
    if (!sourceId) {
      return NextResponse.json(
        { error: "source_persona_id 必填" },
        { status: 400 }
      );
    }

    // 1. Fetch source persona
    const { data: source, error: srcErr } = await supabase
      .from("personas")
      .select("id, user_id, is_public, name, short_description, bio_md")
      .eq("id", sourceId)
      .maybeSingle();

    if (srcErr)
      return NextResponse.json({ error: srcErr.message }, { status: 500 });
    if (!source)
      return NextResponse.json(
        { error: "源人设不存在" },
        { status: 404 }
      );
    if (!canReadPersona(gate.session, source)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 2. Determine name and bio
    const newName =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : source.name;

    const customizations =
      typeof body.customizations === "string" && body.customizations.trim()
        ? body.customizations.trim()
        : "";

    let newBio = source.bio_md ?? "";
    if (customizations) {
      newBio = await mergeBio(source.bio_md ?? "", customizations);
    }

    // 3. Generate short description for the new persona
    const shortDesc = await generateShortDescription(newName, newBio);

    // 4. Create new persona
    const { data: newPersona, error: insertErr } = await supabase
      .from("personas")
      .insert({
        user_id: gate.session.userId,
        name: newName,
        short_description: shortDesc,
        bio_md: newBio,
        source_persona_id: sourceId,
        is_public: false,
      })
      .select("id, name, short_description, bio_md, source_persona_id, created_at")
      .single();

    if (insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // 5. Copy notes from source persona (including embeddings)
    const { data: sourceNotes, error: notesErr } = await supabase
      .from("persona_notes")
      .select("title, body, embedding, metadata")
      .eq("persona_id", sourceId);

    if (notesErr) {
      console.error("[fork] 复制笔记失败:", notesErr.message);
      // persona already created, just skip notes
    }

    let notesCopied = 0;
    if (sourceNotes && sourceNotes.length > 0) {
      const noteRows = sourceNotes.map((n) => ({
        persona_id: newPersona.id,
        user_id: gate.session.userId,
        title: n.title,
        body: n.body,
        embedding: n.embedding,
        metadata: n.metadata ?? {},
      }));

      const { error: noteInsertErr, data: inserted } = await supabase
        .from("persona_notes")
        .insert(noteRows)
        .select("id");

      if (noteInsertErr) {
        console.error("[fork] 写入笔记失败:", noteInsertErr.message);
      } else {
        notesCopied = inserted?.length ?? 0;
      }
    }

    return NextResponse.json({
      persona: newPersona,
      notes_copied: notesCopied,
    });
  } catch (e) {
    console.error("[POST /api/personas/fork]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
