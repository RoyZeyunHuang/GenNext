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
    const body = await req.json();
    const {
      theme,
      hook_name,
      hook_description,
      title_direction,
      brief,
      property_name,
      brand_doc_ids = [],
      task_template_doc_id,
      persona_doc_id,
    } = body as {
      theme?: string;
      hook_name?: string;
      hook_description?: string;
      title_direction?: string;
      brief?: string;
      property_name?: string;
      brand_doc_ids?: string[];
      task_template_doc_id?: string;
      persona_doc_id?: string;
    };

    if (!anthropic.apiKey) {
      return NextResponse.json({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }, { status: 503 });
    }

    const { data: autoCats } = await supabase.from("doc_categories").select("id").eq("is_auto_include", true);
    const autoCatIds = (autoCats ?? []).map((c) => c.id);
    let autoDocIds: string[] = [];
    if (autoCatIds.length > 0) {
      const { data: autoDocs } = await supabase.from("docs").select("id").in("category_id", autoCatIds);
      autoDocIds = (autoDocs ?? []).map((d) => d.id);
    }
    const uniqueBrandIds = [...new Set([...(brand_doc_ids ?? []), ...autoDocIds])];

    let brandContent = "";
    if (uniqueBrandIds.length > 0) {
      const { data: docs } = await supabase.from("docs").select("title, content").in("id", uniqueBrandIds);
      brandContent = (docs ?? []).map((d) => `【${d.title}】\n${(d.content ?? "").trim()}`).join("\n\n");
    }

    let taskContent = "";
    let enableWebSearch = false;
    if (task_template_doc_id) {
      const { data: t } = await supabase.from("docs").select("title, content").eq("id", task_template_doc_id).single();
      if (t) {
        taskContent = `按以下格式创作：\n【${t.title}】\n${(t.content ?? "").trim()}`;
        enableWebSearch =
          (t.title ?? "").includes("联网搜索") || (t.content ?? "").includes("联网搜索");
      }
    }

    let personaContent = "";
    if (persona_doc_id) {
      const { data: p } = await supabase.from("docs").select("title, content").eq("id", persona_doc_id).single();
      if (p) personaContent = `用以下人格说话：\n【${p.title}】\n${(p.content ?? "").trim()}`;
    } else {
      personaContent = "用默认专业风格。";
    }

    const systemPrompt = `你是纽约租房内容创作者。

${brandContent ? `品牌档案：\n${brandContent}\n\n` : ""}
${taskContent ? `${taskContent}\n\n` : ""}
${personaContent}

规则：
1. 围绕租房，不做买房
2. 基于素材混剪，不依赖实拍
3. 服务于品牌曝光和租房咨询
4. 严格遵守钩子方向和人格风格，不混淆

创作信息：
主题：${theme ?? "租房"}
钩子：${hook_name ?? ""} - ${hook_description ?? ""}
标题方向：${title_direction ?? ""}
内容简述：${brief ?? ""}
楼盘：${property_name ?? ""}

只返回 JSON，不要其他文字：
{
  "title": "最终标题",
  "script": "完整脚本，时间标记分段 [0-3s] [3-10s] ...",
  "cover_idea": "封面设计：文案+画面描述",
  "comment_guide": "第一条评论 + 回复话术",
  "hashtags": ["标签1", "标签2"]
}

重要：只输出上述 JSON 本身，不要输出以下内容：
- 不要说你搜索了什么
- 不要说你按照什么模板写的
- 不要说你用了什么人格
- 不要做任何前置说明或分析过程
- 不要在 JSON 前后加任何解释
- 直接输出 JSON，不要其他文字。

格式要求（非常重要，必须严格遵守）：
- 不要使用 **加粗** 或 markdown 格式
- 不要使用标题格式（不要 ## 或 **标题**）
- 段落之间用空行分隔，不要用标题分段
- 要点用 emoji 开头代替数字编号，如 ✅ 📍 💡 🔑 ⚠️
- 语气像小红书博主发帖，不像写文章或报告
- 整体节奏：短句为主，偶尔长句，读起来像在刷手机不是在看文档
- 每隔2-3段自然加1个 emoji，不要堆砌
- 不要有任何看起来像 Word 文档或公众号文章的排版痕迹`;*** End Patch ***!

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: "生成脚本" }],
      ...(enableWebSearch
        ? {
            tools: [
              { type: "web_search_20250305" as const, name: "web_search" },
            ],
          }
        : {}),
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "AI未返回有效JSON", raw: text }, { status: 500 });
    const result = JSON.parse(jsonMatch[0]) as {
      title?: string;
      script?: string;
      cover_idea?: string;
      comment_guide?: string;
      hashtags?: string[];
    };
    return NextResponse.json({
      title: result.title ?? "",
      script: result.script ?? "",
      cover_idea: result.cover_idea ?? "",
      comment_guide: result.comment_guide ?? "",
      hashtags: Array.isArray(result.hashtags) ? result.hashtags : [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "脚本生成失败" }, { status: 500 });
  }
}
