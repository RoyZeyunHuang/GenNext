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
    const {
      brand_doc_ids = [],
      knowledge_doc_ids = [],
      task_template_id,
      persona_template_id,
      user_input = "",
    } = body as {
      brand_doc_ids?: string[];
      knowledge_doc_ids?: string[];
      task_template_id?: string;
      persona_template_id?: string;
      user_input?: string;
    };

    if (!anthropic.apiKey) {
      return new Response(
        JSON.stringify({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch global brand docs for system prompt
    const { data: globalDocs } = await supabase
      .from("brand_docs")
      .select("title, content")
      .eq("is_global", true);

    const systemParts: string[] = [
      "你是一个专业的营销文案师，熟悉地产行业。根据提供的品牌资料、知识库和模板要求，生成高质量的文案内容。",
    ];
    if (globalDocs?.length) {
      systemParts.push("\n\n=== 全局品牌资料（始终参考） ===");
      for (const doc of globalDocs) {
        systemParts.push(`【${doc.title}】\n${(doc.content ?? "").trim()}`);
      }
    }
    const systemPrompt = systemParts.join("\n");

    // Build user message
    const userParts: string[] = [];

    if (brand_doc_ids.length > 0) {
      const { data: brandDocs } = await supabase.from("brand_docs").select("title, content").in("id", brand_doc_ids);
      if (brandDocs?.length) {
        userParts.push("=== 品牌档案 ===");
        for (const d of brandDocs) {
          userParts.push(`【${d.title}】\n${(d.content ?? "").trim()}`);
        }
      }
    }

    if (knowledge_doc_ids.length > 0) {
      const { data: knowledgeDocs } = await supabase.from("knowledge_docs").select("title, content").in("id", knowledge_doc_ids);
      if (knowledgeDocs?.length) {
        userParts.push("\n=== 知识库参考 ===");
        for (const d of knowledgeDocs) {
          userParts.push(`【${d.title}】\n${(d.content ?? "").trim()}`);
        }
      }
    }

    if (task_template_id) {
      const { data: template } = await supabase.from("task_templates").select("title, content").eq("id", task_template_id).single();
      if (template) {
        userParts.push(`\n=== 任务模板：${template.title} ===\n${(template.content ?? "").trim()}`);
      }
    }

    if (persona_template_id) {
      const { data: persona } = await supabase.from("persona_templates").select("title, content").eq("id", persona_template_id).single();
      if (persona) {
        userParts.push(`\n=== 人格设定：${persona.title} ===\n${(persona.content ?? "").trim()}`);
      }
    }

    userParts.push(`\n=== 用户需求 ===\n${user_input || "无具体需求"}`);

    const userMessage = userParts.join("\n");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await anthropic.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
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
