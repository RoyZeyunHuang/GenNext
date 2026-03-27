import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 将 API JSON 中的 error 转为可读字符串，避免 alert([object Object]) */
export function formatUserFacingError(
  data: unknown,
  fallback = "操作失败"
): string {
  if (data == null || typeof data !== "object") return fallback;
  const o = data as Record<string, unknown>;
  const err = o.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  if (typeof o.message === "string" && o.message.trim()) return o.message;
  return fallback;
}

export function formatThrownError(e: unknown, fallback = "操作失败"): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}
