import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { theme, hooks = [], accounts = [] } = body;
    if (!anthropic.apiKey) {
      return NextResponse.json({ error: "未设置 API Key" }, { status: 503 });
    }
    const systemPrompt = `你是纽约租房内容策略师。根据主题、钩子和账号信息，生成一段 200-400 字的策略说明，用于指导后续内容排期。要求：简洁、可执行、突出重点。只返回策略说明正文，不要标题或多余格式。`;
    const userContent = `主题：${theme || "无"}\n钩子：${JSON.stringify(hooks)}\n账号：${JSON.stringify(accounts)}\n请生成策略总结。`;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return NextResponse.json({ summary: text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "生成失败" }, { status: 500 });
  }
}
