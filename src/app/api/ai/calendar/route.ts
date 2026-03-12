import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

const today = new Date().toISOString().split("T")[0];
const SYSTEM_PROMPT = `你是一个日历助手。从用户提供的文字或图片中提取所有事件信息。
只返回 JSON 数组，不要任何解释文字。
格式：[{"title":"事件标题","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","location":"地点","description":"描述"}]
今天是 ${today}，如果提到相对日期如"下周三"请换算成具体日期。
缺失的字段用空字符串 ""。`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CalendarEventItem = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
};

function parseJsonArray(raw: string): CalendarEventItem[] {
  let trimmed = raw.trim();
  const codeBlock = /^```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (codeBlock) trimmed = codeBlock[1].trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  const json = trimmed.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => ({
    title: typeof item?.title === "string" ? item.title : "",
    date: typeof item?.date === "string" ? item.date : "",
    startTime: typeof item?.startTime === "string" ? item.startTime : "",
    endTime: typeof item?.endTime === "string" ? item.endTime : "",
    location: typeof item?.location === "string" ? item.location : "",
    description: typeof item?.description === "string" ? item.description : "",
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      text?: string;
      imageBase64?: string;
      imageMediaType?: "image/jpeg" | "image/png";
    };

    if (!anthropic.apiKey) {
      return Response.json(
        { error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" },
        { status: 503 }
      );
    }

    const hasImage = body.imageBase64 && body.imageMediaType;
    const hasText = typeof body.text === "string" && body.text.trim().length > 0;
    if (!hasImage && !hasText) {
      return Response.json(
        { error: "请提供文字描述或上传图片" },
        { status: 400 }
      );
    }

    const userContent: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string } }> = [];
    if (hasImage) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: body.imageMediaType!,
          data: body.imageBase64!,
        },
      });
    }
    const promptText = hasText
      ? body.text!.trim()
      : "请从上面的图片中识别并提取所有日历/日程事件。";
    userContent.push({ type: "text", text: promptText });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const events = parseJsonArray(raw);
    return Response.json(events);
  } catch (e) {
    const message = e instanceof Error ? e.message : "请求失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
