import { Resend } from "resend";

export type ResendListEntry = {
  id: string;
  last_event: string;
  subject: string;
  created_at: string;
  to: string[];
  from: string;
};

/** Resend 文档：终态失败 / 未送达类 */
const BOUNCE_LIKE = new Set([
  "bounced",
  "failed",
  "suppressed",
  "canceled",
]);

/** 已到达收件方服务器或后续互动 */
const DELIVERED_LIKE = new Set([
  "delivered",
  "opened",
  "clicked",
  "complained",
]);

export function classifyResendLastEvent(lastEvent: string | null | undefined): {
  kind: "bounce" | "delivered" | "pending" | "unknown";
} {
  const e = (lastEvent ?? "").trim().toLowerCase();
  if (!e) return { kind: "unknown" };
  if (BOUNCE_LIKE.has(e)) return { kind: "bounce" };
  if (DELIVERED_LIKE.has(e)) return { kind: "delivered" };
  return { kind: "pending" };
}

/**
 * 分页拉取当前 Resend 账号下所有「已发送」邮件元数据（含 last_event）。
 * 量大时可能较慢；需 RESEND_API_KEY。
 */
export async function fetchAllResendSentList(): Promise<Map<string, ResendListEntry>> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("未配置 RESEND_API_KEY");
  }
  const resend = new Resend(key);
  const byId = new Map<string, ResendListEntry>();
  let after: string | undefined;

  for (;;) {
    const opts =
      after !== undefined
        ? { limit: 100 as const, after }
        : { limit: 100 as const };
    const { data, error } = await resend.emails.list(opts);
    if (error) {
      const msg =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: string }).message)
          : JSON.stringify(error);
      throw new Error(`Resend list 失败: ${msg}`);
    }
    const page = data?.data ?? [];
    for (const row of page) {
      if (!row?.id) continue;
      byId.set(row.id, {
        id: row.id,
        last_event: row.last_event ?? "",
        subject: row.subject ?? "",
        created_at: row.created_at ?? "",
        to: row.to ?? [],
        from: row.from ?? "",
      });
    }
    if (!data?.has_more || page.length === 0) break;
    after = page[page.length - 1]!.id;
  }

  return byId;
}
