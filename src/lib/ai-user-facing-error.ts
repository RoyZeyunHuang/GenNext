/**
 * 将上游 AI（Claude / OpenAI 等）过载、限流等错误统一为用户可读文案。
 */

export const AI_NETWORK_USER_MESSAGE =
  "太多人请求了，让虚拟人忙一下，等一分钟！";

function stringifyUnknown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 是否为可提示用户「稍后再试」的瞬时类错误（过载、限流、503 等） */
export function isAiTransientOverloadError(err: unknown): boolean {
  const s = stringifyUnknown(err);
  if (
    /overloaded|Overloaded|overloaded_error|529|rate[_\s-]?limit|too many requests|429\b|503\b|unavailable|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
      s
    )
  ) {
    return true;
  }
  if (s.includes("overloaded_error")) return true;
  try {
    const j = JSON.parse(s) as {
      error?: { type?: string; message?: string };
    };
    if (j?.error?.type === "overloaded_error") return true;
    if (j?.error?.message === "Overloaded") return true;
  } catch {
    /* 非 JSON */
  }
  const o = err as {
    status?: number;
    error?: { type?: string };
    code?: string;
  };
  if (o?.status === 529 || o?.status === 503 || o?.status === 429) return true;
  if (o?.error?.type === "overloaded_error") return true;
  if (o?.code === "overloaded_error" || o?.code === "rate_limit_exceeded") {
    return true;
  }
  return false;
}

/** API 与前端统一使用：瞬时类错误返回固定提示，其余返回原始信息 */
export function formatAiErrorForUser(err: unknown): string {
  if (isAiTransientOverloadError(err)) return AI_NETWORK_USER_MESSAGE;
  return stringifyUnknown(err);
}
