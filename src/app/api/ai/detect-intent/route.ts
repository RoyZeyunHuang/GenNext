import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
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

    const { data: categories } = await supabase
      .from("doc_categories")
      .select("id, name, description")
      .order("sort_order", { ascending: true });

    const { data: docsRows } = await supabase
      .from("docs")
      .select("id, title, category_id, tags");

    const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
    const docs = (docsRows ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      category_id: d.category_id,
      category_name: categoryMap.get(d.category_id)?.name ?? "",
      tags: d.tags ?? [],
    }));

    const categoriesJson = JSON.stringify(
      (categories ?? []).map((c) => ({ name: c.name, description: c.description || "" }))
    );
    const docsJson = JSON.stringify(docs);

    const systemPrompt = `你是内容创作助手。用户输入了一个创作需求，你需要根据需求从以下文档中推荐会用到的文档。所有类别一视同仁，只推荐与用户需求相关的文档，每项附一句话 reason。

文档类别：
${categoriesJson}

所有文档：
${docsJson}

只返回 JSON，不要其他文字。格式：
{
  "suggested_docs": [
    { "doc_id": "uuid", "doc_title": "标题", "category_name": "类别名", "reason": "一句话说明为什么选" }
  ]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: user_input }],
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI未返回有效JSON", raw: text }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      suggested_docs?: { doc_id: string; doc_title: string; category_name: string; reason?: string }[];
    };

    const suggested_docs = parsed.suggested_docs ?? [];

    return NextResponse.json({ suggested_docs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "意图分析失败" },
      { status: 500 }
    );
  }
}
