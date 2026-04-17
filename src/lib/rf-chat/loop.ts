/**
 * 对话主循环：
 *   - 流式输出 Claude 的 text delta
 *   - 处理 tool_use 循环
 *   - 去重、收敛保护
 *   - 识别 terminatesLoop 工具（ask_user），立刻退出
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ExecContext, Tool } from "./types";
import type { Registry } from "./registry";

export type SseEvent =
  | { type: "delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      status: string;
      /** 候选（ambiguous 时有），给 UI 渲染 */
      candidates?: Array<{ id: string; label: string; hint?: string }>;
      /** AI 看得到的 user_facing_message 透传给 UI */
      user_facing_message?: string;
    }
  | {
      type: "ask_user";
      question: string;
      options: Array<{ id: string; label: string; hint?: string }>;
    }
  | { type: "done"; success: true }
  | { type: "error"; message: string; success: false };

export type LoopConfig = {
  model: string;
  maxIterations: number;
  /** 连续非 ok 响应超过这个数就强制退出 */
  maxConsecutiveNonOk: number;
  systemPrompt: string;
};

export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  model: "claude-sonnet-4-20250514",
  maxIterations: 8,
  maxConsecutiveNonOk: 4,
  systemPrompt: "", // 由 route.ts 注入
};

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export async function runChatLoop(
  startMessages: Anthropic.MessageParam[],
  ctx: ExecContext,
  registry: Registry,
  cfg: LoopConfig,
  emit: (e: SseEvent) => void
): Promise<void> {
  let currentMessages = startMessages;
  let terminatedByAskUser = false;

  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    // 收敛保护：连续非 ok 太多次，停
    if (ctx.consecutiveNonOk >= cfg.maxConsecutiveNonOk) {
      emit({
        type: "error",
        message:
          "我连续几次都没找到你要的东西。建议换个说法、换个条件，或者告诉我你具体想找什么？",
        success: false,
      });
      return;
    }

    const stream = anthropic.messages.stream({
      model: cfg.model,
      max_tokens: 3000,
      system: cfg.systemPrompt,
      tools: registry.anthropicTools,
      messages: currentMessages,
    });

    stream.on("text", (delta) => emit({ type: "delta", text: delta }));

    const finalMsg = await stream.finalMessage();

    if (finalMsg.stop_reason !== "tool_use") {
      // 普通文字回合结束
      emit({ type: "done", success: true });
      return;
    }

    // 处理工具调用
    const toolUseBlocks = finalMsg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUseBlocks) {
      const input = (tu.input as Record<string, unknown>) ?? {};
      emit({ type: "tool_call", id: tu.id, name: tu.name, input });
      const result = await registry.execute(tu.name, input, ctx);
      emit({
        type: "tool_result",
        id: tu.id,
        name: tu.name,
        status: result.status,
        candidates: result.candidates,
        user_facing_message: result.user_facing_message,
      });
      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });

      // terminatesLoop 工具（ask_user）：直接发 ask_user 事件，停循环
      const tool = registry.byName.get(tu.name) as Tool | undefined;
      if (tool?.terminatesLoop === true && result.status === "ok") {
        const d = result.data as { question: string; options: unknown[] } | undefined;
        emit({
          type: "ask_user",
          question: d?.question ?? "",
          options:
            Array.isArray(d?.options) && d
              ? (d.options as Array<{ id: string; label: string; hint?: string }>)
              : [],
        });
        terminatedByAskUser = true;
        break;
      }
    }

    if (terminatedByAskUser) {
      // 不再回给 Claude——用户要回答
      emit({ type: "done", success: true });
      return;
    }

    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: finalMsg.content },
      { role: "user", content: toolResults },
    ];
  }

  emit({
    type: "error",
    message: `我调用工具 ${cfg.maxIterations} 轮还没搞定。可能问题太复杂了，要不你换个问法？`,
    success: false,
  });
}
