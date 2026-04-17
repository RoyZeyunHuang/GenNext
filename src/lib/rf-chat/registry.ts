import type Anthropic from "@anthropic-ai/sdk";
import { ALL_TOOLS } from "./tools";
import {
  callKey,
  duplicateCall,
  toolError,
  type ExecContext,
  type Tool,
  type ToolResult,
} from "./types";

/**
 * 工具注册表 —— 把所有 Tool 统一起来给两个消费者：
 *   1) Anthropic SDK 需要的 Tool[] schema
 *   2) 执行入口（按 name 派发）+ 去重缓存包裹
 */
export type Registry = {
  anthropicTools: Anthropic.Tool[];
  byName: Map<string, Tool>;
  /**
   * 执行入口。自动做：
   *   - name 未知 → toolError
   *   - ctx.callCache 命中 → duplicateCall（不重跑）
   *   - 正常跑，按 ok/非 ok 维护 ctx.consecutiveNonOk，写入 callCache
   */
  execute: (name: string, input: unknown, ctx: ExecContext) => Promise<ToolResult>;
};

export function buildRegistry(tools: Tool[] = ALL_TOOLS): Registry {
  const byName = new Map<string, Tool>();
  const anthropicTools: Anthropic.Tool[] = [];
  for (const t of tools) {
    byName.set(t.name, t);
    anthropicTools.push({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    });
  }

  async function execute(
    name: string,
    input: unknown,
    ctx: ExecContext
  ): Promise<ToolResult> {
    const tool = byName.get(name);
    if (!tool) return toolError(`Unknown tool: ${name}`);

    // 去重：相同 tool + 相同 input 已调用过 → 不重跑
    const key = callKey(name, input);
    const prior = ctx.callCache.get(key);
    if (prior) {
      return duplicateCall(
        `这个工具用同样的参数已经调过了。上次结果的 status=${prior.status}。不要重复调用——如果上次是 not_found/error/ambiguous，换个参数或换个工具；如果上次是 ok，直接用上次的 data。`,
        prior
      );
    }

    try {
      const result = await (tool as Tool<Record<string, unknown>>).execute(
        (input as Record<string, unknown>) ?? {},
        ctx
      );
      ctx.callCache.set(key, result);
      if (result.status === "ok") {
        ctx.consecutiveNonOk = 0;
      } else {
        ctx.consecutiveNonOk += 1;
      }
      return result;
    } catch (e) {
      const err = toolError(e instanceof Error ? e.message : String(e));
      ctx.callCache.set(key, err);
      ctx.consecutiveNonOk += 1;
      return err;
    }
  }

  return { anthropicTools, byName, execute };
}
