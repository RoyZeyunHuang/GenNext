import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { formatAiErrorForUser } from "@/lib/ai-user-facing-error";

const SYSTEM_PROMPT =
  "你是一个专业的营销文案师，熟悉地产行业。根据提供的产品档案资料，生成符合要求的文案内容，保持品牌调性一致。";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { document_ids = [], type = "", prompt = "" } = body as {
      document_ids?: string[];
      type?: string;
      prompt?: string;
    };

    if (!anthropic.apiKey) {
      return new Response(
        JSON.stringify({
          error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    let context = "";
    if (document_ids?.length > 0) {
      const { data } = await supabase
        .from("documents")
        .select("name, content")
        .in("id", document_ids);
      if (data?.length) {
        context = data
          .map((d) => `【${d.name ?? "未命名"}】\n${(d.content ?? "").trim()}`)
          .filter((s) => s.length > 0)
          .join("\n\n");
      }
    }

    const userMessage = context
      ? `参考资料：\n${context}\n\n文案类型：${type || "未指定"}\n需求：${prompt || "无"}`
      : `文案类型：${type || "未指定"}\n需求：${prompt || "无"}`;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await anthropic.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
          });

          for await (const event of response) {
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode("ERROR: " + formatAiErrorForUser(err))
          );
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
      JSON.stringify({ error: formatAiErrorForUser(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
