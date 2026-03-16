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
    if (!anthropic.apiKey) {
      return NextResponse.json({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }, { status: 503 });
    }

    const { data: autoCategories } = await supabase
      .from("doc_categories")
      .select("id")
      .eq("is_auto_include", true);
    const catIds = (autoCategories ?? []).map((c) => c.id);
    let brandContent = "";
    if (catIds.length > 0) {
      const { data: docs } = await supabase
        .from("docs")
        .select("title, content")
        .in("category_id", catIds);
      brandContent = (docs ?? []).map((d) => `【${d.title}】\n${(d.content ?? "").slice(0, 500)}`).join("\n\n");
    }

    const { data: recentPlans } = await supabase
      .from("content_plans")
      .select("theme")
      .not("theme", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20);
    const usedThemes = Array.from(new Set((recentPlans ?? []).map((p) => (p.theme ?? "").trim()).filter(Boolean)));

    const systemPrompt = `你是纽约租房内容策略师。根据品牌资料和近期已用主题，推荐 3 个新的排期主题（避免与近期重复）。

${brandContent ? `品牌资料摘要：\n${brandContent}\n\n` : ""}
近期已用主题（避免重复）：${usedThemes.join("、") || "无"}

只返回 JSON 数组，不要其他文字：["主题1", "主题2", "主题3"]
主题示例：组团租房、通勤便利、预算友好、看房攻略、室友故事`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: "推荐3个排期主题" }],
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    const themes = jsonMatch ? (JSON.parse(jsonMatch[0]) as string[]) : [];
    return NextResponse.json({ themes: themes.slice(0, 3) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "推荐失败" }, { status: 500 });
  }
}
