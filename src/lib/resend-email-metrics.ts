import { fetchAllResendSentList, type ResendListEntry } from "@/lib/resend-list-sent";

/** 终态失败 / 未送达（与 resend-list-sent 一致） */
const BOUNCE = new Set(["bounced", "failed", "suppressed", "canceled"]);

/** 已进入收件方侧或后续互动（用于送达 / 打开分母） */
const IN_MAILBOX = new Set(["delivered", "opened", "clicked", "complained"]);

const OPEN_ENGAGEMENT = new Set(["opened", "clicked"]);

export type ResendPitchMetrics = {
  emailSent: number;
  deliveryRate: number;
  openRate: number;
};

/**
 * 根据 Resend `emails.list` 返回的 `last_event` 聚合指标。
 * 所有指标均按**收件人数**（to + cc）统计：
 * - Email Sent = Σ(to.length + cc.length)
 * - 每封邮件的 last_event 视为对该邮件全部收件人统一生效，按收件人数加权
 * - Delivery Rate = (sent - bounced) / sent  （与 Resend 控制台一致）
 * - Open Rate = opened / delivered
 */
export function aggregatePitchMetricsFromResendEntries(entries: ResendListEntry[]): ResendPitchMetrics {
  const norm = (e: string) => (e || "").trim().toLowerCase();
  let bouncedRecipients = 0;
  let openedRecipients = 0;
  let deliveredRecipients = 0;
  let totalRecipients = 0;

  for (const row of entries) {
    const rcpt = Math.max((row.to?.length ?? 0) + (row.cc?.length ?? 0), 1);
    totalRecipients += rcpt;
    const ev = norm(row.last_event);
    if (BOUNCE.has(ev)) {
      bouncedRecipients += rcpt;
    } else if (IN_MAILBOX.has(ev)) {
      deliveredRecipients += rcpt;
      if (OPEN_ENGAGEMENT.has(ev)) openedRecipients += rcpt;
    }
  }

  const emailSent = totalRecipients;
  const deliveryRate = totalRecipients > 0
    ? Math.round((100 * (totalRecipients - bouncedRecipients)) / totalRecipients)
    : 0;
  const delivered = totalRecipients - bouncedRecipients;
  const openRate = delivered > 0
    ? Math.round((100 * openedRecipients) / delivered)
    : 0;

  return { emailSent, deliveryRate, openRate };
}

export type ResendPitchMetricsResult =
  | {
      ok: true;
      metrics: ResendPitchMetrics;
      pagesFetched: number;
      listTotalUnfiltered: number;
      listTotalFiltered: number;
    }
  | { ok: false; reason: "no_api_key" | "error"; message?: string };

/**
 * 从 `fetchAllResendSentList`（与「Resend 发信与送达」弹窗共享缓存）聚合指标。
 * 可选环境变量 `RESEND_METRICS_FROM_FILTER`：仅统计 `from` 包含该子串的邮件（不区分大小写）。
 */
export async function tryGetResendPitchMetrics(): Promise<ResendPitchMetricsResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { ok: false, reason: "no_api_key" };
  }

  try {
    const { map, pagesFetched } = await fetchAllResendSentList();
    const filterRaw = process.env.RESEND_METRICS_FROM_FILTER?.trim() ?? "";
    const filterSub = filterRaw.toLowerCase();
    const all = Array.from(map.values());
    const entries = filterSub
      ? all.filter((e) => e.from.toLowerCase().includes(filterSub))
      : all;
    const metrics = aggregatePitchMetricsFromResendEntries(entries);
    const listTotalUnfiltered = map.size;
    const listTotalFiltered = entries.length;
    return {
      ok: true,
      metrics,
      pagesFetched,
      listTotalUnfiltered,
      listTotalFiltered,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "error", message };
  }
}
