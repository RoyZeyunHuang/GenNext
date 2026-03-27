import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildDetectIntentSystemPrompt, RECOMMEND_TOOL } from "@/lib/prompt-templates";
import { resolvePromptDocRole } from "@/lib/doc-category-constants";
import { supabase } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { user_input } = (await req.json()) as { user_input: string };

    if (!user_input?.trim()) {
      return NextResponse.json({ error: "user_input is required" }, { status: 400 });
    }

    if (!anthropic.apiKey) {
      return NextResponse.json(
        { error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" },
        { status: 503 }
      );
    }

    const { data: categories } = await supabase
      .from("doc_categories")
      .select("id, name, description")
      .order("sort_order", { ascending: true });

    const { data: docsRows } = await supabase
      .from("docs")
      .select("id, title, category_id, tags, role");

    const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));

    const docs = (docsRows ?? []).map((d) => {
      const categoryName = categoryMap.get(d.category_id)?.name ?? "";
      return {
        id: d.id,
        title: d.title,
        category_name: categoryName,
        role: resolvePromptDocRole(categoryName, d.role ?? null),
        tags: Array.isArray(d.tags) ? d.tags : [],
      };
    });

    const docsListLines = docs
      .map((d) => `- ID:${d.id} | ${d.category_name} | role:${d.role} | ${d.title} | tags:${d.tags.join(",")}`)
      .join("\n");
    const systemPrompt = buildDetectIntentSystemPrompt(docsListLines);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [RECOMMEND_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: RECOMMEND_TOOL.name },
      messages: [{ role: "user", content: user_input }],
    });

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (!toolBlock) {
      return NextResponse.json({ error: "AI未返回有效推荐" }, { status: 500 });
    }

    const result = toolBlock.input as {
      suggested_docs: {
        doc_id: string;
        doc_title: string;
        category_name: string;
        reason: string;
      }[];
    };

    return NextResponse.json({ suggested_docs: result.suggested_docs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "意图分析失败" },
      { status: 500 }
    );
  }
}
