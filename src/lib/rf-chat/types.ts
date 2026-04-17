/**
 * RF Chat tool-use 架构核心契约
 *
 * 三个核心思想：
 *  1) 消解 "先 list 再 use ID" 反模式：每个工具接受任何表达（name/id/slug/fuzzy），内部 resolve。
 *  2) 所有工具统一返回 `ToolResult`，带 `status` 枚举 + 可选 candidates / hint / user_facing_message。
 *     AI 不再靠文字猜错误类型，靠状态码直接路由。
 *  3) 工具行为由协议决定，不靠 system prompt 教——prompt 只讲风格和产品规则。
 */
import type Anthropic from "@anthropic-ai/sdk";

/** 工具返回的状态码——AI 依据这个决定下一步，不用"读文字猜" */
export type ToolStatus =
  | "ok" /* 成功，用 data */
  | "ambiguous" /* 模糊，给了 candidates，让 AI 问用户挑 */
  | "not_found" /* 明确找不到，不要重试，告诉用户 */
  | "invalid_input" /* AI 传参不对——改参数可重试，但要说明为什么 */
  | "quota_exhausted" /* 额度用完，停止 */
  | "permission_denied" /* 无权限，停止 */
  | "duplicate_call" /* 同 tool + 同参数已调用过，用上一次结果 */
  | "already_done" /* 类同 duplicate_call，但针对 generate_copy 这种单次型工具 */
  | "rate_limited" /* 外部 API 限速，稍后 */
  | "error" /* 其它硬错误，停止 */;

export type Candidate = {
  id: string;
  label: string;
  hint?: string;
};

/** 统一的工具返回。整个项目只能用这一个形状。 */
export type ToolResult<T = unknown> = {
  status: ToolStatus;
  /** status=ok 时携带 */
  data?: T;
  /** status=ambiguous 时携带候选列表 */
  candidates?: Candidate[];
  /** AI 面向的下一步提示（"调 list_personas 拿 id"、"用 candidates 的 id 重试"） */
  hint?: string;
  /** 给最终用户看的话（AI 可以复述或提炼） */
  user_facing_message?: string;
  /** 只有 recoverable=true 的非 ok 状态 AI 才可以换参数重试 */
  recoverable?: boolean;
};

/** 单次 HTTP 请求的执行上下文 */
export type ExecContext = {
  userId: string;
  email?: string;
  isAdmin: boolean;
  personaGenerateUnlimited: boolean;
  hasMainAccess: boolean;

  /** 本次请求里 generate_copy 是否已成功跑过一次（缓存结果，避免重复消耗额度） */
  generateCopyFirstResult: ToolResult | null;

  /** tool name + stringified input → prior result，用于去重 */
  callCache: Map<string, ToolResult>;

  /** 连续 N 次非 ok 响应计数——收敛保护 */
  consecutiveNonOk: number;
};

/** 工具接口——注册表里每个工具都实现这个 */
export interface Tool<TInput = Record<string, unknown>> {
  /** Claude tool name，snake_case */
  name: string;
  /** Claude 看到的描述，必须写清楚 status 协议 */
  description: string;
  /** Anthropic JSON schema */
  input_schema: Anthropic.Tool.InputSchema;
  /** 实际执行。status=ok 时 data 的形状由工具自己文档化（hint / description 里说清楚）。 */
  execute: (input: TInput, ctx: ExecContext) => Promise<ToolResult>;
  /**
   * 是否在 ask_user 后终止循环（ask_user 是 first-class，调用后立刻返回给用户）。
   * 默认 false。
   */
  terminatesLoop?: boolean;
}

// ───── 便捷工厂 ─────

export function ok<T>(data: T, extra?: Partial<ToolResult<T>>): ToolResult<T> {
  return { status: "ok", data, ...extra };
}
export function ambiguous(
  candidates: Candidate[],
  hint?: string
): ToolResult {
  return {
    status: "ambiguous",
    candidates,
    hint: hint ?? "多个候选。把 candidates 展示给用户，让他选一个，用户选完再调本工具用 id。",
    recoverable: true,
  };
}
export function notFound(what: string, hint?: string): ToolResult {
  return {
    status: "not_found",
    hint: hint ?? `没找到 ${what}，请告诉用户并建议换条件`,
    user_facing_message: `没找到「${what}」`,
    recoverable: false,
  };
}
export function invalidInput(reason: string, hint?: string): ToolResult {
  return {
    status: "invalid_input",
    hint: hint ?? reason,
    recoverable: true,
  };
}
export function quotaExhausted(limit: number): ToolResult {
  return {
    status: "quota_exhausted",
    user_facing_message: `本周黑魔法生成次数已用完（${limit}/周），请下周再试或到「反馈」页申请加额度`,
    recoverable: false,
  };
}
export function permissionDenied(reason: string): ToolResult {
  return {
    status: "permission_denied",
    user_facing_message: reason,
    recoverable: false,
  };
}
export function duplicateCall(hint: string, priorResult?: ToolResult): ToolResult {
  return {
    status: "duplicate_call",
    hint,
    data: priorResult,
    recoverable: false,
  };
}
export function alreadyDone(hint: string, priorResult: ToolResult): ToolResult {
  return {
    status: "already_done",
    hint,
    data: priorResult,
    recoverable: false,
  };
}
export function toolError(msg: string): ToolResult {
  return {
    status: "error",
    hint: msg,
    user_facing_message: `内部错误：${msg}`,
    recoverable: false,
  };
}

/** 稳定 hash（tool name + 规范化 input），用于 callCache 的 key */
export function callKey(name: string, input: unknown): string {
  try {
    const canonical = JSON.stringify(input, Object.keys(input ?? {}).sort());
    return `${name}::${canonical}`;
  } catch {
    return `${name}::<unhashable>`;
  }
}
