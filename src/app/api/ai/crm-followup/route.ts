import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { companyName, recentNotes } = (await req.json()) as {
      companyName: string;
      recentNotes: string[];
    };
    if (!anthropic.apiKey) {
      return Response.json({ error: "未设置 API Key" }, { status: 503 });
    }
    const notesText = recentNotes.length > 0 ? recentNotes.join("\n") : "暂无沟通记录";
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system:
        "你是一个专业的地产BD（商务拓展）人员。根据公司名称和近期沟通记录，生成一段自然友好的微信跟进消息。" +
        "消息应该：1. 简短，不超过200字 2. 语气自然专业 3. 包含具体的行动号召 4. 适合微信聊天场景",
      messages: [
        {
          role: "user",
          content: `公司：${companyName}\n近期沟通记录：\n${notesText}\n\n请生成跟进微信消息：`,
        },
      ],
    });
    const text = response.content.find((c) => c.type === "text");
    return Response.json({ message: text && "text" in text ? text.text : "" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "请求失败";
    return Response.json({ error: msg }, { status: 500 });
  }
}
