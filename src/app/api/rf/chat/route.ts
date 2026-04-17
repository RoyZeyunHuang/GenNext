/**
 * RF Chat v2 - 薄壳路由。所有逻辑在 src/lib/rf-chat/。
 *
 * 架构要点：
 *  - Tool 实现散在 src/lib/rf-chat/tools/，每个一个文件
 *  - Registry 负责去重 + 状态统计
 *  - Loop 负责多轮循环 + 收敛保护 + SSE 事件
 *  - System prompt 只讲产品规则和语气，不讲"不要重试"这类工具契约（契约已经在 ToolResult.status 里）
 */
import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { formatAiErrorForUser } from "@/lib/ai-user-facing-error";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { buildRegistry } from "@/lib/rf-chat/registry";
import { runChatLoop, type SseEvent } from "@/lib/rf-chat/loop";
import type { ExecContext } from "@/lib/rf-chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────── System Prompt ───────────────────────
// 注意：不要在这里写「错误时怎么办」「调完一次别再调」等工具契约。
// 这些现在由 ToolResult.status 协议保证，AI 看到 status=ok/ambiguous/not_found/already_done/...
// 自然知道下一步。prompt 只讲「这个助手是谁 / 说话风格 / 产品规则」。

const SYSTEM_PROMPT = `你是 RF（Rednote Factory）里一个像同事一样好聊的 AI 助手，帮经纪人/创作者：
- 查楼盘 / listing / 人格笔记
- 用指定人格（可选指定楼盘）生成小红书 / Instagram / 口播文案

# 说话风格
像同事在微信里聊天。不用 Markdown 标题、粗体、多层列表。分点用「·」或「一是/二是」这样的口语。能一句说完就一句。

# 工具使用心法（不是规则，是心法——规则由工具自己返回的 status 保证）
- 工具接受自然语言。用户说「SOLA」你就 building:"SOLA"，不用先查 id。persona 同理。
- 用户说的地名/amenity 可能不是库里字面量。第一次撞「没找到」前用探索工具试：list_areas / list_neighborhoods / list_amenities。
- 不要假装有数据。工具返回空就老实说没找到、建议换条件。
- 要让用户在候选里选？调 ask_user 把 options 传过去，前端会渲染成按钮——比你用文字列候选更清楚。

# 数据真实性
引用价格、面积、户型、amenity 必须用工具返回的数字，不要编。

# 生成文案
用户明确说「写一个」「帮我出一篇」再调 generate_copy。单次对话最多一次（服务端保证）。成功后 data.generated 是完整文案——原样贴给用户。`;

// ─────────────────────── POST ───────────────────────

type ChatBody = {
  message?: string;
  conversation_history?: Anthropic.MessageParam[];
};

export async function POST(req: NextRequest) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    return new Response(JSON.stringify({ error: "未设置 ANTHROPIC_API_KEY" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as ChatBody;
  const message = String(body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "缺少 message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const history = Array.isArray(body.conversation_history) ? body.conversation_history : [];
  const startMessages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: message },
  ];

  const ctx: ExecContext = {
    userId: gate.session.userId,
    email: gate.session.email,
    isAdmin: gate.session.isAdmin,
    personaGenerateUnlimited: gate.session.personaGenerateUnlimited,
    hasMainAccess: gate.session.hasMainAccess,
    generateCopyFirstResult: null,
    callCache: new Map(),
    consecutiveNonOk: 0,
  };

  console.log(
    `[rf/chat] user=${ctx.email} admin=${ctx.isAdmin} unlimited=${ctx.personaGenerateUnlimited}`
  );

  const registry = buildRegistry();

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const emit = (e: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        await runChatLoop(
          startMessages,
          ctx,
          registry,
          {
            model: "claude-sonnet-4-20250514",
            maxIterations: 8,
            maxConsecutiveNonOk: 4,
            systemPrompt: SYSTEM_PROMPT,
          },
          emit
        );
      } catch (err) {
        console.error("[rf/chat] error:", err);
        emit({
          type: "error",
          message: formatAiErrorForUser(err),
          success: false,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
