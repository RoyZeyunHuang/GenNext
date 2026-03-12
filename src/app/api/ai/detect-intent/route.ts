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

    const [brandRes, knowledgeRes, taskRes, personaRes] = await Promise.all([
      supabase.from("brand_docs").select("id, title, tags, property_name"),
      supabase.from("knowledge_docs").select("id, title, tags, type"),
      supabase.from("task_templates").select("id, title, platform"),
      supabase.from("persona_templates").select("id, title, description, is_default"),
    ]);

    const catalog = JSON.stringify({
      brand_docs: (brandRes.data ?? []).map((d) => ({ id: d.id, title: d.title, tags: d.tags, property_name: d.property_name })),
      knowledge_docs: (knowledgeRes.data ?? []).map((d) => ({ id: d.id, title: d.title, tags: d.tags, type: d.type })),
      task_templates: (taskRes.data ?? []).map((d) => ({ id: d.id, title: d.title, platform: d.platform })),
      persona_templates: (personaRes.data ?? []).map((d) => ({ id: d.id, title: d.title, description: d.description, is_default: d.is_default })),
    });

    const systemPrompt = `你是内容创作意图分析助手。根据用户的内容创作需求，从提供的档案/模板目录中推荐最匹配的选项。

可用目录：
${catalog}

分析用户输入，返回JSON格式（只返回JSON，不要其他文字）：
{
  "detected_property": "识别到的楼盘名，没有则为空字符串",
  "detected_platform": "识别到的平台(xiaohongshu/instagram/linkedin/video/wechat/other)，没有则为空字符串",
  "suggested_brand_docs": ["匹配的品牌档案id数组"],
  "suggested_knowledge": ["匹配的知识库文档id数组"],
  "suggested_task_template": "最匹配的任务模板id或null",
  "suggested_persona": "最匹配的人格模板id或null"
}

匹配规则：
1. 如果用户提到了楼盘名，优先匹配对应 property_name 的品牌档案
2. 根据平台关键词匹配任务模板（小红书→xiaohongshu, ins/ig→instagram等）
3. 如果没有明确人格要求，推荐 is_default=true 的人格模板
4. 全局品牌档案（property_name为空的）也应包含在推荐中`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: user_input }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI未返回有效JSON", raw: text }, { status: 500 });
    }

    const intent = JSON.parse(jsonMatch[0]);
    return NextResponse.json(intent);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "意图分析失败" }, { status: 500 });
  }
}
