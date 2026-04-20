/**
 * 高层 API：一步到位把一个 StreetEasy 建筑页 URL 抓回来 + 解析成结构化数据。
 *
 * 这是给"任何想拿一个楼盘数据"的地方用的单一入口——不管是 cron、admin UI、
 * 调试脚本、还是未来的新业务——都通过这一个函数取数据。
 *
 * 特性：
 *  - 无副作用（不写 DB，不触发任何流水线）
 *  - 纯组合：底层是 fetchHtml (scrapingbee.ts) + parseBuildingPage (rsc-parser.ts)
 *  - 失败抛 ScrapingBeeError 或 Error，由调用方决定怎么兜底
 */

import { fetchHtml, type ScrapingBeeOptions } from "./scrapingbee";
import { parseBuildingPage, type ParsedPage } from "./rsc-parser";

export type { ParsedPage, ParsedListing, ParsedBuildingStatic, ParsedBuildingDynamic } from "./rsc-parser";
export { ScrapingBeeError } from "./scrapingbee";

/**
 * 抓取并解析一个 SE 建筑页。
 * @param url 完整 SE URL，例 "https://streeteasy.com/building/the-orchard-42-06-orchard-street"
 * @param options 可选：覆盖 ScrapingBee 调用参数（代理类型、超时等）
 */
export async function scrapeBuilding(
  url: string,
  options?: ScrapingBeeOptions,
): Promise<ParsedPage> {
  const html = await fetchHtml(url, options);
  return parseBuildingPage(html);
}
