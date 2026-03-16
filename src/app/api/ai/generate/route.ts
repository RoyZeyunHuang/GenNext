import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { selected_doc_ids = [], user_input = "" } = body as {
      selected_doc_ids?: string[];
      user_input?: string;
    };

    const allDocIds = (Array.isArray(selected_doc_ids) ? selected_doc_ids : []).filter(Boolean);

    if (!anthropic.apiKey) {
      return new Response(
        JSON.stringify({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    let enableWebSearch = false;
    const systemParts: string[] = [
      "你是一个专业的营销文案师，熟悉地产行业。根据用户选中的文档（品牌资料、知识库、模板等）和需求，生成高质量的文案内容。",
    ];

    if (allDocIds.length > 0) {
      const { data: docs } = await supabase
        .from("docs")
        .select("id, title, content, category_id")
        .in("id", allDocIds);

      const byCategory = await (async () => {
        const { data: categories } = await supabase.from("doc_categories").select("id, name");
        return new Map((categories ?? []).map((c) => [c.id, c.name]));
      })();

      systemParts.push("\n\n=== 用户选中的参考资料 ===");
      for (const doc of docs ?? []) {
        const catName = byCategory.get(doc.category_id) ?? "";
        systemParts.push(`【${catName} · ${doc.title}】\n${(doc.content ?? "").trim()}`);
      }
      const docsList = (docs ?? []) as { id: string; title: string; content: string | null; category_id: string }[];
      enableWebSearch = docsList.some(
        (d) => (d.content ?? "").includes("联网搜索") || (d.title ?? "").includes("联网搜索")
      );
    }

    systemParts.push(`
重要：只输出最终文案本身，不要输出以下内容：
- 不要说你搜索了什么
- 不要说你按照什么模板写的
- 不要说你用了什么人格
- 不要做任何前置说明或分析过程
- 不要在文案前后加任何解释
- 直接输出标题和正文，第一行就是标题，第二行开始就是正文

格式要求（非常重要，必须严格遵守）：
- 不要使用 **加粗** 或 markdown 格式
- 不要使用标题格式（不要 ## 或 **标题**）
- 段落之间用空行分隔，不要用标题分段
- 要点用 emoji 开头代替数字编号，如 ✅ 📍 💡 🔑 ⚠️
- 语气像小红书博主发帖，不像写文章或报告
- 整体节奏：短句为主，偶尔长句，读起来像在刷手机不是在看文档
- 每隔2-3段自然加1个 emoji，不要堆砌
- 不要有任何看起来像 Word 文档或公众号文章的排版痕迹`);

    const systemPrompt = systemParts.join("\n");
    const userMessage = `=== 用户需求 ===\n${user_input || "无具体需求"}`;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await anthropic.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
            ...(enableWebSearch
              ? {
                  tools: [
                    { type: "web_search_20250305" as const, name: "web_search" },
                  ],
                }
              : {}),
          });
          for await (const event of response) {
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode("ERROR: " + errMsg));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "请求失败" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
