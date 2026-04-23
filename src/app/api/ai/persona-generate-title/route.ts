import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TITLE_OUTPUT_TOOL } from "@/lib/prompt-templates";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { canReadPersona } from "@/lib/persona-access";
import { normalizePersonaContentKind } from "@/lib/persona-rag/content-kind";
import {
  PERSONA_TITLE_VARIANT_ORDER,
  buildPersonaTitleSystemPrompt,
  buildPersonaTitleUserMessage,
  sortPersonaTitlesByVariantOrder,
} from "@/lib/persona-rag/title-generation";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  if (!anthropic.apiKey) {
    return NextResponse.json({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const persona_id = typeof body.persona_id === "string" ? body.persona_id.trim() : "";
  const body_text = typeof body.body_text === "string" ? body.body_text.trim() : "";
  const user_input = typeof body.user_input === "string" ? body.user_input.trim() : "";
  const title_pattern_doc_id =
    typeof body.title_pattern_doc_id === "string" ? body.title_pattern_doc_id.trim() : "";
  const contentKind = normalizePersonaContentKind(body.content_kind);
  const titleContentKind = contentKind === "oral_script" ? "oral_script" : "xiaohongshu";

  if (!persona_id || !body_text) {
    return NextResponse.json({ error: "persona_id 与 body_text 必填" }, { status: 400 });
  }

  const { data: persona, error: pe } = await supabase
    .from("personas")
    .select("id, bio_md, name, user_id, is_public, visibility")
    .eq("id", persona_id)
    .maybeSingle();

  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
  if (!persona) return NextResponse.json({ error: "persona not found" }, { status: 404 });

  let allowedUserIds: string[] | undefined;
  if (persona.visibility === "assigned") {
    const { data: rows } = await supabase
      .from("persona_allowed_users")
      .select("user_id")
      .eq("persona_id", persona_id);
    allowedUserIds = rows?.map((r) => r.user_id as string) ?? [];
  }

  if (!canReadPersona(gate.session, { ...persona, allowed_user_ids: allowedUserIds })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let customTemplate: string | null = null;
  if (title_pattern_doc_id) {
    const { data: doc } = await supabase
      .from("docs")
      .select("content")
      .eq("id", title_pattern_doc_id)
      .maybeSingle();
    if (doc?.content) customTemplate = doc.content;
  }

  const systemPrompt = buildPersonaTitleSystemPrompt(
    persona.bio_md || "",
    customTemplate,
    titleContentKind
  );
  const userMessage = buildPersonaTitleUserMessage(user_input, body_text);

  const tools: Anthropic.Tool[] = [
    {
      name: TITLE_OUTPUT_TOOL.name,
      description: TITLE_OUTPUT_TOOL.description,
      input_schema: TITLE_OUTPUT_TOOL.input_schema,
    } as unknown as Anthropic.Tool,
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    tools,
    tool_choice: { type: "tool", name: TITLE_OUTPUT_TOOL.name },
    messages: [{ role: "user", content: userMessage }],
  });

  const titleBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TITLE_OUTPUT_TOOL.name
  );

  if (!titleBlock) {
    return NextResponse.json({ error: "模型未返回标题结构" }, { status: 502 });
  }

  const result = titleBlock.input as { titles?: { type_name: string; text: string }[] };
  const raw = Array.isArray(result.titles) ? result.titles : [];

  let titles: { type_name: string; text: string }[];
  if (customTemplate) {
    titles = raw;
  } else {
    const sorted = sortPersonaTitlesByVariantOrder(raw);
    const expected = new Set<string>(Array.from(PERSONA_TITLE_VARIANT_ORDER));
    const filtered = sorted.filter((t) => expected.has(t.type_name));
    titles = filtered.length > 0 ? filtered : sorted;
  }

  return NextResponse.json({
    titles,
    phase: "titles",
    content_kind: contentKind,
  });
}
