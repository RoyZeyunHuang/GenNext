/**
 * 解析 StreetEasy 建筑详情页（bdp-2022 路由）。
 *
 * SE 用 Next.js App Router RSC streaming 格式：HTML 里有一堆
 *   <script>self.__next_f.push([1,"..."])</script>
 * 把 chunk id → chunk payload 的映射塞进 __next_f 数组。
 *
 * 每条 listing 是一个 JSON 对象，带 "unitTypeLabel":"RENTAL" 标识。
 * 一栋楼一般在 RSC 流里出现 2 次（summary + detail），我们按 id 去重。
 *
 * 建筑级字段通过 `$<chunkId>` 引用散在各 chunk，需要顺藤摸瓜解出。
 */

export interface ParsedListing {
  /** StreetEasy listing id（主键） */
  id: string;
  /** listing 详情页 URL */
  url: string;
  /** 单元号，带 # 前缀，例 "#19J" */
  unit: string | null;
  /** 月租金（美元，纯数字，例 4035） */
  price_monthly: number | null;
  /** 卧室数：Studio → 0.0；"1 bed" → 1.0；"2 beds" → 2.0 */
  bedrooms: number | null;
  /** 浴室数："1 bath" → 1.0；"2.5 baths" → 2.5 */
  bathrooms: number | null;
  /** 家具 */
  furnished: boolean;
  /** 可入住日期原文，例 "Now" / "Jun 1"；留给上层转 date 用 */
  available_at_raw: string | null;
  /** 免租月数（SE 这页的 monthsFree，多半 0 或 1） */
  months_free: number | null;
  /** 租期月数（例 13） */
  lease_term_months: number | null;
  /** 缩略图 URL */
  image_url: string | null;
  /** listing_type：RENTAL / SALE；我们只抓 RENTAL */
  listing_type: string;
  /** 是否在租（status === ACTIVE） */
  is_active: boolean;
}

export interface ParsedBuildingDynamic {
  /** 当前有多少条 active 租约（= listings 数） */
  active_rentals_count: number;
  /**
   * 可租出的总数（SE 有个 availabilityByBedroomCount 汇总；
   * 通常 == active_rentals_count，但某些情况下 SE 会把"同户型多套"合并）
   */
  open_rentals_count: number;
  /** 已出租（status != ACTIVE，这页上一般不显示，先置 0） */
  closed_rentals_count: number;
}

export interface ParsedBuildingStatic {
  /** StreetEasy 内部 building_id，string-of-int；apt_buildings.id 主键用这个 */
  building_id: string | null;
  /** 楼盘名，例 "The Orchard" */
  name: string | null;
  /** 地址，例 "42-06 Orchard Street" */
  address: string | null;
  /** 邮政编码 */
  zip_code: string | null;
  /** 城市 */
  city: string | null;
  year_built: number | null;
  floor_count: number | null;
  unit_count: number | null;
  latitude: number | null;
  longitude: number | null;
  /** 品牌/开发商 */
  developer: string | null;
  /** 运营/出租管理公司（marketingTeam） */
  leasing_company: string | null;
  /** 官网 URL */
  official_url: string | null;
  /** 建筑描述（meta description） */
  description: string | null;
  /** 楼盘封面图（og:image） */
  image_url: string | null;
  /** SE 的 amenity list（扁平字符串数组） */
  amenities: string[];
  /** 是否标 NEW_DEVELOPMENT */
  is_new_development: boolean;
}

export interface ParsedPage {
  listings: ParsedListing[];
  dynamic: ParsedBuildingDynamic;
  /** 静态字段——上层可选择是否用（首次 enrich 才写，每日抓取不用覆盖） */
  static: ParsedBuildingStatic;
}

// ─── 内部工具 ───────────────────────────────────────────

/**
 * 从 HTML 抽出所有 self.__next_f.push 字符串并拼成单一 RSC stream。
 * 每条 push 的 payload 是 JSON-string-escaped 的字符串，需要 JSON.parse 解一次。
 */
function extractRscStream(html: string): string {
  const rx = /self\.__next_f\.push\(\[\d+,"((?:\\"|[^"])*)"\]\)<\/script>/g;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    try {
      // 把 push 里的字符串用 JSON.parse 解转义
      chunks.push(JSON.parse(`"${m[1]}"`));
    } catch {
      // 忽略解不了的 chunk，后面照常跑
    }
  }
  return chunks.join("");
}

/**
 * 构建 RSC chunk id → payload 映射。每行格式：`<hexId>:<payload>` 到下一行 id 为止。
 */
function buildChunkMap(rsc: string): Map<string, string> {
  const map = new Map<string, string>();
  // RSC stream 格式：每行 "<hexId>:<payload>"，payload 可能跨行。
  // 手动扫描比单正则的 s flag (TS target 限制) 更兼容。
  const lines = rsc.split("\n");
  let currentId: string | null = null;
  let currentPayload: string[] = [];
  for (const line of lines) {
    const m = /^([0-9a-f]+):(.*)$/.exec(line);
    if (m && /^[0-9a-f]+$/.test(m[1])) {
      // 新 chunk 开始 —— 提交旧的
      if (currentId !== null) {
        map.set(currentId, currentPayload.join("\n"));
      }
      currentId = m[1];
      currentPayload = [m[2]];
    } else if (currentId !== null) {
      // 延续上一个 chunk 的 payload
      currentPayload.push(line);
    }
  }
  if (currentId !== null) {
    map.set(currentId, currentPayload.join("\n"));
  }
  return map;
}

/** 把 `"$b3"` 这种引用解成实际 chunk payload；若不是引用或找不到返回原字符串。 */
function deref(value: unknown, chunks: Map<string, string>): unknown {
  if (typeof value !== "string") return value;
  if (!value.startsWith("$")) return value;
  const key = value.slice(1);
  const payload = chunks.get(key);
  if (!payload) return value;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

/**
 * 在 RSC 全文里按 keyword 定位对应 JSON 对象（含括号配对）。
 * 返回解析后的对象数组；去重由调用方负责。
 */
function findObjectsContaining(
  rsc: string,
  keyword: string,
  minLen = 0,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let cursor = 0;
  while (cursor < rsc.length) {
    const idx = rsc.indexOf(keyword, cursor);
    if (idx < 0) break;
    // 往前找 {
    let depth = 0;
    let start = -1;
    for (let i = idx; i >= 0; i--) {
      const ch = rsc[i];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          start = i;
          break;
        }
        depth--;
      }
    }
    if (start < 0) {
      cursor = idx + 1;
      continue;
    }
    // 往后找配对 }
    depth = 0;
    let end = -1;
    for (let i = start; i < rsc.length; i++) {
      const ch = rsc[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) {
      cursor = idx + 1;
      continue;
    }
    if (end - start >= minLen) {
      try {
        const obj = JSON.parse(rsc.slice(start, end)) as Record<string, unknown>;
        out.push(obj);
      } catch {
        /* skip malformed */
      }
    }
    cursor = end;
  }
  return out;
}

// ─── 字段转换 ───────────────────────────────────────────

function parsePrice(s: unknown): number | null {
  if (typeof s !== "string") return typeof s === "number" ? s : null;
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseBedrooms(s: unknown): number | null {
  if (typeof s !== "string") return null;
  if (/studio/i.test(s)) return 0;
  const m = /(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) : null;
}

function parseBathrooms(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) : null;
}

/**
 * "Now" / "Jun 1" / "Jun 15" 等 → null (for "Now") 或 ISO date string "YYYY-MM-DD"。
 * SE 不标年份，推导规则：取"今天之后最近的那个 Jun 1"。
 */
export function parseAvailableAt(s: unknown, now = new Date()): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.trim();
  if (/^now$/i.test(t)) {
    // "Now" 用今天
    return now.toISOString().slice(0, 10);
  }
  const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m = /^([A-Za-z]+)\s+(\d{1,2})$/.exec(t);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
  const day = Number(m[2]);
  if (month === undefined || !Number.isFinite(day)) return null;
  // 取 now 之后最近的该月份日期
  const year = now.getFullYear();
  const candidate = new Date(year, month, day);
  if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) {
    candidate.setFullYear(year + 1);
  }
  return candidate.toISOString().slice(0, 10);
}

// ─── 主入口 ─────────────────────────────────────────────

/**
 * 解析 StreetEasy 建筑详情页 HTML。
 * @param html ScrapingBee 返回的完整 HTML
 */
export function parseBuildingPage(html: string): ParsedPage {
  const rsc = extractRscStream(html);
  const chunks = buildChunkMap(rsc);

  // ── Listings ──
  const rawListings = findObjectsContaining(rsc, '"unitTypeLabel":"RENTAL"');
  const seen = new Set<string>();
  const listings: ParsedListing[] = [];

  // 建 thumbnail 引用映射：`125:{"type":"PHOTO","url":"..."}`
  const photoMap = new Map<string, string>();
  chunks.forEach((payload, id) => {
    const m = /^\{"type":"PHOTO","url":"([^"]+)"\}$/.exec(payload.trim());
    if (m) photoMap.set(id, m[1]);
  });

  for (const obj of rawListings) {
    const id = String(obj.id ?? "");
    if (!id || seen.has(id)) continue;
    // 只保留 RENTAL + 必要字段齐
    if (obj.unitTypeLabel !== "RENTAL") continue;
    if (!obj.listingUrl || !obj.price) continue;
    seen.add(id);

    const thumbRef = typeof obj.thumbnail === "string"
      ? (obj.thumbnail as string).replace(/^\$/, "")
      : "";
    const imageUrl = thumbRef ? photoMap.get(thumbRef) ?? null : null;

    listings.push({
      id,
      url: String(obj.listingUrl),
      unit: typeof obj.unit === "string" ? obj.unit : null,
      price_monthly: parsePrice(obj.price),
      bedrooms: parseBedrooms(obj.bedrooms),
      bathrooms: parseBathrooms(obj.bathrooms),
      furnished: Boolean(obj.furnished),
      available_at_raw: typeof obj.availabilityDate === "string" ? obj.availabilityDate : null,
      months_free: typeof obj.monthsFree === "number" ? obj.monthsFree : null,
      lease_term_months: typeof obj.leaseTermMonths === "number" ? obj.leaseTermMonths : null,
      image_url: imageUrl,
      listing_type: "RENTAL",
      is_active: obj.status === "ACTIVE",
    });
  }

  // ── Building metadata ──
  const dynamicBuilding: ParsedBuildingDynamic = {
    active_rentals_count: listings.filter((l) => l.is_active).length,
    open_rentals_count: listings.filter((l) => l.is_active).length,
    closed_rentals_count: 0,
  };

  // 尝试找 building-level 的 object，特征是包含 yearBuilt + 坐标
  const buildingObjs = findObjectsContaining(rsc, '"yearBuilt":');
  const buildingObj = buildingObjs.find(
    (o) =>
      "yearBuilt" in o &&
      typeof o.yearBuilt === "number" &&
      // 过滤掉 "similar building" 引用（它们也有 yearBuilt 但没 latitude）
      ("latitude" in o || "floorCount" in o || "amenities" in o),
  );

  // 地址 chunk —— 直接从 RSC 找 street/city/zipCode 对象
  const addrObjs = findObjectsContaining(rsc, '"zipCode":');
  const addrObj = addrObjs.find((o) => "street" in o && "city" in o);

  const staticBuilding: ParsedBuildingStatic = {
    building_id: extractBuildingId(html),
    name: extractTitle(html),
    address: typeof addrObj?.street === "string" ? (addrObj.street as string) : null,
    zip_code: typeof addrObj?.zipCode === "string" ? (addrObj.zipCode as string) : null,
    city: typeof addrObj?.city === "string" ? (addrObj.city as string) : null,
    year_built: typeof buildingObj?.yearBuilt === "number" ? (buildingObj.yearBuilt as number) : null,
    floor_count: typeof buildingObj?.floorCount === "number" ? (buildingObj.floorCount as number) : null,
    unit_count: typeof buildingObj?.unitCount === "number" ? (buildingObj.unitCount as number) : null,
    latitude: typeof buildingObj?.latitude === "number" ? (buildingObj.latitude as number) : null,
    longitude: typeof buildingObj?.longitude === "number" ? (buildingObj.longitude as number) : null,
    developer: extractDeveloper(chunks),
    leasing_company: extractLeasingCompany(chunks),
    official_url: extractOfficialUrl(chunks),
    description: extractMetaDescription(html),
    image_url: extractOgImage(html),
    amenities: extractAmenities(rsc, chunks),
    is_new_development: /"status":"NEW_DEVELOPMENT"/.test(rsc),
  };

  return { listings, dynamic: dynamicBuilding, static: staticBuilding };
}

// ─── HTML meta 提取辅助 ────────────────────────────────

/**
 * 从 HTML 里提取 SE 内部 building_id（纯数字），主要依据 past_transactions_component URL。
 */
function extractBuildingId(html: string): string | null {
  // 最可靠：past_transactions_component/<id>
  const m1 = /past_transactions_component\/(\d+)/.exec(html);
  if (m1) return m1[1];
  // 备用：buildingId 出现 + 本栋 URL 上下文
  // （SE 页面上会有若干 similar buildings 的 buildingId，挑难，暂时只靠 m1）
  return null;
}

function extractTitle(html: string): string | null {
  const m = /<title>([^<]+)<\/title>/.exec(html);
  if (!m) return null;
  // "The Orchard at 42-06 Orchard Street in Hunters Point : Sales, Rentals..." → "The Orchard"
  const title = m[1].split(" at ")[0]?.trim();
  return title || null;
}

function extractMetaDescription(html: string): string | null {
  const m = /<meta name="description" content="([^"]+)"/.exec(html);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function extractOgImage(html: string): string | null {
  const m = /<meta property="og:image" content="([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ─── RSC chunk 取特定字段 ─────────────────────────────

function extractFromChunksByRegex(chunks: Map<string, string>, rx: RegExp): string | null {
  let found: string | null = null;
  chunks.forEach((payload) => {
    if (found) return;
    const m = rx.exec(payload);
    if (m) found = m[1];
  });
  return found;
}

function extractDeveloper(chunks: Map<string, string>): string | null {
  return extractFromChunksByRegex(chunks, /"developer":"([^"]+)"/);
}

function extractLeasingCompany(chunks: Map<string, string>): string | null {
  return extractFromChunksByRegex(chunks, /"marketingTeam":"([^"]+)"/);
}

function extractOfficialUrl(chunks: Map<string, string>): string | null {
  return extractFromChunksByRegex(chunks, /"website":"(https?:\/\/[^"]+)"/);
}

/**
 * SE amenities 分好几组：list / doormanTypes / parkingTypes / sharedOutdoorSpaceTypes / storageSpaceTypes。
 * 每组都是字符串数组。我们全拼在一起返回一个扁平列表。
 */
function extractAmenities(rsc: string, chunks: Map<string, string>): string[] {
  const result: string[] = [];
  // 从 rsc 找 "amenities":{"list":"$a5", ...} 这种结构的 chunk
  const amenRefs = findObjectsContaining(rsc, '"amenities":').find(
    (o) => typeof (o as Record<string, unknown>).amenities === "object",
  );
  if (!amenRefs) {
    // fallback: 从 chunks 直接扫所有字符串数组
    chunks.forEach((payload) => {
      if (/^\["[^"]+"(,"[^"]+")*\]$/.test(payload.trim())) {
        try {
          const arr = JSON.parse(payload) as string[];
          if (arr.every((x) => typeof x === "string") && arr.length < 50) {
            result.push(...arr);
          }
        } catch { /* skip */ }
      }
    });
    return Array.from(new Set(result));
  }

  const amenObj = deref(
    (amenRefs as Record<string, unknown>).amenities,
    chunks,
  ) as Record<string, unknown> | null;
  if (!amenObj) return [];

  const groups = ["list", "doormanTypes", "parkingTypes", "sharedOutdoorSpaceTypes", "storageSpaceTypes"];
  for (const g of groups) {
    const raw = deref(amenObj[g], chunks);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string" && item.trim()) result.push(item.trim());
      }
    }
  }
  return Array.from(new Set(result));
}
