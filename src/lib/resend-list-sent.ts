import { Resend } from "resend";

export type ResendListEntry = {
  id: string;
  last_event: string;
  subject: string;
  created_at: string;
  to: string[];
  cc: string[];
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

const LIST_FETCH_CACHE_TTL_MS = 60_000;

/** Resend 硬限：5 req/s。这里按 4 req/s（250ms 间隔）预留安全缓冲。 */
const MIN_REQUEST_INTERVAL_MS = 250;
/** 429 / 明显限流错误时的最大重试次数 */
const RATE_LIMIT_MAX_RETRIES = 5;
/** 429 退避基础毫秒（指数退避：500 / 1000 / 2000 / 4000 / 8000） */
const RATE_LIMIT_BASE_BACKOFF_MS = 500;

let listFetchCache: {
  at: number;
  map: Map<string, ResendListEntry>;
  pagesFetched: number;
} | null = null;

let listFetchInflight: Promise<{
  map: Map<string, ResendListEntry>;
  pagesFetched: number;
}> | null = null;

/** 进程内的「上一次 Resend 调用时间戳」，用于节流——让不同路径共用同一个间隔守门。 */
let lastResendCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 等到距上一次调用至少 MIN_REQUEST_INTERVAL_MS，避免 5 req/s 撞墙。 */
async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastResendCallAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastResendCallAt = Date.now();
}

/** 判断错误消息是否是限流相关 */
function isRateLimitError(msg: string): boolean {
  const s = msg.toLowerCase();
  return (
    s.includes("too many requests") ||
    s.includes("rate limit") ||
    s.includes("429")
  );
}

/**
 * 实际请求 Resend 分页（无缓存）。
 */
async function fetchAllResendSentListUncached(): Promise<{
  map: Map<string, ResendListEntry>;
  pagesFetched: number;
}> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("未配置 RESEND_API_KEY");
  }
  const resend = new Resend(key);
  const byId = new Map<string, ResendListEntry>();
  let after: string | undefined;
  /** Resend 单页上限；文档示例为 100。若响应未带 has_more，需用「满页则继续翻」避免只统计第一页 */
  const LIMIT = 100 as const;
  const maxPages = 500;
  let pages = 0;

  for (;;) {
    pages++;
    if (pages > maxPages) {
      throw new Error(`Resend list 超过 ${maxPages} 页上限，请联系开发调大或缩小统计范围`);
    }
    const opts =
      after !== undefined ? { limit: LIMIT, after } : { limit: LIMIT };

    // 带退避的单页请求
    let data: unknown;
    let lastErrMsg = "";
    let succeeded = false;
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
      await throttle();
      const resp = await resend.emails.list(opts);
      if (!resp.error) {
        data = resp.data;
        succeeded = true;
        break;
      }
      const err = resp.error;
      lastErrMsg =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: string }).message)
          : JSON.stringify(err);
      if (!isRateLimitError(lastErrMsg) || attempt === RATE_LIMIT_MAX_RETRIES) {
        break;
      }
      // 指数退避：500ms → 1s → 2s → 4s → 8s
      const backoff = RATE_LIMIT_BASE_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoff);
    }
    if (!succeeded) {
      throw new Error(`Resend list 失败: ${lastErrMsg}`);
    }
    const body = data as
      | { data?: unknown[]; has_more?: boolean; hasMore?: boolean }
      | undefined;
    const page = Array.isArray(body?.data) ? body.data : [];
    if (page.length === 0) break;

    for (const row of page) {
      const r = row as {
        id?: string;
        last_event?: string;
        subject?: string;
        created_at?: string;
        to?: string[];
        cc?: string[];
        from?: string;
      };
      if (!r?.id) continue;
      byId.set(r.id, {
        id: r.id,
        last_event: r.last_event ?? "",
        subject: r.subject ?? "",
        created_at: r.created_at ?? "",
        to: r.to ?? [],
        cc: r.cc ?? [],
        from: r.from ?? "",
      });
    }

    // 不依赖 has_more：Resend 可能在仍有后续数据时对满页误报 has_more:false，导致只统计一页（~100）或更少。
    // 结束条件：空页、未满页、或游标无法前进。
    if (page.length < LIMIT) break;

    const lastId = (page[page.length - 1] as { id?: string })?.id;
    if (!lastId || lastId === after) break;
    after = lastId;
  }

  return { map: byId, pagesFetched: pages };
}

/**
 * 分页拉取当前 Resend 账号下所有「已发送」邮件元数据（含 last_event）。
 * 与「Resend 发信与送达」弹窗共用 **同一份内存缓存 + 并发去重**，避免指标 Tab 与批量同步各打一遍 API、结果还不一致。
 */
export async function fetchAllResendSentList(): Promise<{
  map: Map<string, ResendListEntry>;
  pagesFetched: number;
}> {
  const now = Date.now();
  if (listFetchCache && now - listFetchCache.at < LIST_FETCH_CACHE_TTL_MS) {
    return {
      map: listFetchCache.map,
      pagesFetched: listFetchCache.pagesFetched,
    };
  }
  if (listFetchInflight) {
    return listFetchInflight;
  }
  listFetchInflight = (async () => {
    try {
      const r = await fetchAllResendSentListUncached();
      listFetchCache = {
        at: Date.now(),
        map: r.map,
        pagesFetched: r.pagesFetched,
      };
      return r;
    } finally {
      listFetchInflight = null;
    }
  })();
  return listFetchInflight;
}
