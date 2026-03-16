import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVERS = ["情感共鸣", "稀缺特权", "社交证明", "安全感", "身份感", "其他"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const theme = body.theme?.trim() || "";
    if (!anthropic.apiKey) {
      return NextResponse.json({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }, { status: 503 });
    }

    const systemPrompt = `你是纽约租房内容策略师。根据主题拆解出 3-5 个内容钩子，每个钩子包含：名称、简短描述、驱动力。

驱动力只能从以下选一个：${DRIVERS.join("、")}

只返回 JSON 数组，不要其他文字。格式：
[{"name":"钩子名称","description":"一句话描述","driver":"驱动力"}]`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: `主题：${theme || "租房内容"}\n请拆解钩子` }],
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    const hooks = jsonMatch ? (JSON.parse(jsonMatch[0]) as { name: string; description: string; driver: string }[]) : [];
    const normalized = hooks.map((h) => ({
      name: String(h.name || "").trim(),
      description: String(h.description || "").trim(),
      driver: DRIVERS.includes(h.driver) ? h.driver : "其他",
    }));
    return NextResponse.json({ hooks: normalized });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "拆钩子失败" }, { status: 500 });
  }
}
