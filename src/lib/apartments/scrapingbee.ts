/**
 * ScrapingBee wrapper — 抓取 StreetEasy 建筑页的 HTML。
 *
 * 为什么用 ScrapingBee：
 * - SE 有 Cloudflare + 反爬虫；我们需要 residential proxy + headless Chrome 才能过。
 * - 这些 SB 全包办，我们只负责发 GET + 解析返回的 HTML。
 *
 * 成本：每次调用 25 credits（premium_proxy=true + render_js=true）。
 * 40 栋/天 * 30 天 = 30k credits/月，Freelance $49 套餐 100k 够用。
 */

export class ScrapingBeeError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
    this.name = "ScrapingBeeError";
  }
}

const SCRAPINGBEE_BASE = "https://app.scrapingbee.com/api/v1/";

export interface ScrapingBeeOptions {
  /** 渲染 JavaScript（SE 用 Next.js SSR，但有些数据靠 JS 注入；稳起见开着） */
  renderJs?: boolean;
  /** 住宅代理（必需，SE 会 ban 数据中心 IP） */
  premiumProxy?: boolean;
  /** 代理地理位置（SE 对非美 IP 更严，默认 us） */
  countryCode?: string;
  /** 请求超时（秒，默认 30） */
  timeoutSec?: number;
}

const DEFAULT_OPTIONS: Required<ScrapingBeeOptions> = {
  renderJs: true,
  premiumProxy: true,
  countryCode: "us",
  timeoutSec: 45,
};

/**
 * 抓一个 URL 的最终渲染后 HTML。
 * 成功返回 HTML 字符串；失败抛 ScrapingBeeError。
 */
export async function fetchHtml(
  targetUrl: string,
  options: ScrapingBeeOptions = {},
): Promise<string> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    throw new ScrapingBeeError("SCRAPINGBEE_API_KEY 未设置");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const params = new URLSearchParams({
    api_key: apiKey,
    url: targetUrl,
    render_js: String(opts.renderJs),
    premium_proxy: String(opts.premiumProxy),
    country_code: opts.countryCode,
    // block_resources=false 让 SB 加载所有资源（保证 RSC chunk 完整）
    block_resources: "false",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutSec * 1000);

  try {
    const res = await fetch(`${SCRAPINGBEE_BASE}?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ScrapingBeeError(
        `ScrapingBee HTTP ${res.status}: ${body.slice(0, 300)}`,
        res.status,
        body,
      );
    }
    return await res.text();
  } catch (e) {
    if (e instanceof ScrapingBeeError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new ScrapingBeeError(
        `ScrapingBee 超时 (${opts.timeoutSec}s)：${targetUrl}`,
      );
    }
    throw new ScrapingBeeError(
      `ScrapingBee fetch 异常：${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
