import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { effectiveRent } from "@/lib/apartments/compute";
import { NYC_CAMPUSES, AMENITY_LABELS } from "@/lib/apartments/constants";
import type { Building, Listing } from "@/lib/apartments/types";
import type { CommuteResult } from "@/lib/apartments/commute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-20250514";
const STALE_AFTER_DAYS = 30;

const SYSTEM = `你是一名在纽约做了十年的华人房产经纪。你的任务不是写给客户看的推介文案,而是为内部 agent 整理一份"楼盘卖点 brief"——agent 会拿着这份 brief 自己组织语言去跟客户聊。

输出格式:

用以下固定 section,每个 section 用 emoji 前缀 + 中文标题:
✅ 价格
✅ 配套
✅ 通勤 [学校简称]
✅ 同区对比
✅ 时机

另加可选的 ⚠️ 注意 section(只在确实有 weakness/caveat 时才出现,没有就不要这个 section)。

每个 section 下面用 • 圆点列具体卖点,一项一行。

写作要求:
- 纯中文,信息密度高,每项带具体数字(美元/百分比/分钟/数量)。
- 不要写完整段落,不要营销语。
- 禁用词:"非常适合"、"理想之选"、"孩子"、"家长"、"您"、"为您"、"打造"、"享受"、"打动"、"必住"、"心仪"、"上佳"、"绝佳"。
- 不要写"以下是"、"针对 X 学校"、"### " 这种引言或 markdown header。
- 不要给 agent 建议怎么说("可以告诉客户...")——只列事实卖点,agent 自己组织。

数据使用规则:
- 只列**真实有的卖点**,不要凑数。如果"价格"section 在数据里就是平庸的,这一项就用一句中性陈述("价格落在同区中位附近,$X-$Y 区间")带过,不要硬吹。
- "同区对比"section 一定要**具体引用 peer 楼盘名字 + 百分比或美元差额**(prompt 末尾提供同区数据)。例: "比 Skyline Tower 便宜 8% ($300/月),但泳池/门卫/健身配置完全一致"
- "配套"section 优先列**同区独有/稀缺**的项(prompt 里会标"本楼独有/稀缺")。常规配套(电梯、洗衣、包裹室)不用全列,挑 3-5 个有杀伤力的。
- 通勤 section 必须包含: 总分钟数 / 主线路代号 / 是否换乘。
- 时机 section 列: 当前在租数+户型分布 / 最早入住日期 / 当前优惠是否还在。

控制总量:
- 全部 section 加起来不超过 25 个 bullet。
- 同 section 内 bullet 不超过 5 个。

输出示例(语感参考,不要照抄数字):

✅ 价格
• 起价 $3,800/月,比同区中位 $4,150 低 8%
• 签 13 个月可拿 1 个月免租,净租金折到 $3,508
• 同区 13 栋在租楼里第 3 便宜

✅ 配套
• 75 尺泳池(同区仅 3/13 栋有)
• 24h 全天门卫 + concierge + 自动包裹室
• 屋顶平台 + 室内健身房 + 瑜伽室

✅ 通勤 NYU WSQ
• 28 分钟门到门
• N/W 直达 8 街,无需换乘
• 步行到 Court Sq 地铁站 2 分钟

✅ 同区对比
• 比 The Orchard 便宜 18%,但泳池/门卫一样
• 跟 Skyline Tower 价格接近,但 2024 年开盘比它新
• 配套强度 ≈ Lumen LIC,价格便宜 12%

✅ 时机
• 当前 6 套在租 (3 套 1卧 / 3 套 2卧)
• 最早 7-1 入住
• 1 个月免租优惠仍在 (按当下抓取)

⚠️ 注意
• 总单元数仅 240 套,新挂出节奏较慢
• 没有车位 (招商表里也无 valet)`;

type PitchInput = {
  building: Building;
  listings: Listing[];
  commute: CommuteResult | null;
  schoolName: string;
  schoolShort: string;
  peers: PeerSummary[];
};

interface PeerSummary {
  name: string;
  yearBuilt: number | null;
  amenities: string[];
  active: number;
  minPrice: number;
  maxPrice: number;
  commuteMinutes: number | null;
}

/**
 * Fetch a few same-area peer buildings so the LLM can write comparative,
 * specific copy ("比 Skyline 便宜 5% 但配套差不多"). We sort by min price
 * ascending and cap to 6 to keep the prompt focused.
 */
async function fetchPeers(
  db: SupabaseClient,
  area: string,
  selfId: string,
  schoolShort: string,
): Promise<PeerSummary[]> {
  const { data: peers } = await db
    .from("apt_buildings")
    .select("id, name, year_built, amenities, commutes")
    .eq("area", area)
    .eq("is_tracked", true)
    .neq("id", selfId)
    .limit(40);

  const peerArr = (Array.isArray(peers) ? peers : []) as Array<{
    id: string;
    name: string;
    year_built: number | null;
    amenities: string[] | null;
    commutes: CommuteResult[] | null;
  }>;
  if (peerArr.length === 0) return [];

  const ids = peerArr.map((p) => p.id);
  const { data: listings } = await db
    .from("apt_listings")
    .select("building_id, price_monthly")
    .in("building_id", ids)
    .eq("is_active", true);

  const pricesByBldg = new Map<string, number[]>();
  for (const l of (Array.isArray(listings) ? listings : []) as Array<{
    building_id: string | null;
    price_monthly: number | null;
  }>) {
    if (!l.building_id || l.price_monthly == null) continue;
    const arr = pricesByBldg.get(l.building_id) ?? [];
    arr.push(l.price_monthly);
    pricesByBldg.set(l.building_id, arr);
  }

  const out: PeerSummary[] = [];
  for (const p of peerArr) {
    const prices = pricesByBldg.get(p.id) ?? [];
    if (prices.length === 0) continue; // no inventory = not actionable peer
    const commute = (p.commutes ?? []).find((c) => c.campusShortName === schoolShort);
    out.push({
      name: p.name,
      yearBuilt: p.year_built,
      amenities: p.amenities ?? [],
      active: prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      commuteMinutes: commute?.transit?.durationMinutes ?? null,
    });
  }
  return out
    .sort((a, b) => a.minPrice - b.minPrice)
    .slice(0, 6);
}

function buildPrompt(p: PitchInput): { user: string; promptHash: string } {
  const { building, listings, commute, schoolName, schoolShort, peers } = p;
  const active = listings.filter((l) => l.is_active);
  const prices = active.map((l) => l.price_monthly).filter((x): x is number => x != null).sort((a, b) => a - b);
  const minP = prices[0];
  const maxP = prices[prices.length - 1];
  const minEff = active.reduce((m, l) => {
    const e = effectiveRent(l.price_monthly, l.months_free, l.lease_term_months);
    return Math.min(m, e ?? Infinity);
  }, Infinity);
  const beds = Array.from(new Set(active.map((l) => l.bedrooms).filter((x): x is number => x != null))).sort((a, b) => a - b);
  const moveIns = active.map((l) => l.available_at).filter(Boolean).sort();
  const earliestMoveIn = moveIns[0];
  const maxConcession = active.reduce((m, l) => Math.max(m, l.months_free ?? 0), 0);
  const ams = (building.amenities ?? []).map((a) => AMENITY_LABELS[a] ?? a);
  const transit = commute?.transit;

  // Same-area pricing context: where does this building sit?
  const allMins = peers.map((p) => p.minPrice).concat(minP ? [minP] : []);
  const median = allMins.length
    ? [...allMins].sort((a, b) => a - b)[Math.floor(allMins.length / 2)]
    : null;
  const positionLine = minP && median
    ? minP < median * 0.92
      ? `本楼起价比同区中位($${median.toLocaleString()})低 ${Math.round(((median - minP) / median) * 100)}%。`
      : minP > median * 1.1
      ? `本楼起价比同区中位($${median.toLocaleString()})高 ${Math.round(((minP - median) / median) * 100)}%。`
      : `本楼起价 $${minP.toLocaleString()},基本就在同区中位($${median.toLocaleString()})附近。`
    : null;

  // Peer block — short one-liner per peer
  const peerLines = peers.map((p) => {
    const yr = p.yearBuilt ? `${p.yearBuilt}年` : "?";
    const cm = p.commuteMinutes != null ? `, 通勤 ${p.commuteMinutes} 分` : "";
    const peerAms = p.amenities
      .map((a) => AMENITY_LABELS[a] ?? a)
      .filter((a) => ["泳池", "门卫", "全天门卫", "健身房", "屋顶平台", "可养狗", "代客泊车"].includes(a))
      .slice(0, 3)
      .join("/");
    return `- ${p.name}: $${p.minPrice.toLocaleString()}-$${p.maxPrice.toLocaleString()} (${p.active} 套), ${yr}${cm}, 配套: ${peerAms || "(基础)"}`;
  });

  // Highlight unique amenities (this building has but ≤1 peer has)
  const peerAmCount = new Map<string, number>();
  for (const peer of peers) {
    for (const a of peer.amenities) peerAmCount.set(a, (peerAmCount.get(a) ?? 0) + 1);
  }
  const ownAms = new Set(building.amenities ?? []);
  const uniqueAms = Array.from(ownAms)
    .filter((a) => (peerAmCount.get(a) ?? 0) <= 1)
    .map((a) => AMENITY_LABELS[a] ?? a);

  const block = [
    `# 学校`,
    `${schoolName} (${schoolShort})`,
    ``,
    `# 本楼基本信息`,
    `名字: ${building.name}`,
    `地址: ${building.address ?? "-"} (${building.neighborhood ?? building.borough ?? ""})`,
    `年份: ${building.year_built ?? "?"}`,
    `层数 / 单元: ${building.floor_count ?? "?"} 层 / 共 ${building.unit_count ?? "?"} 套`,
    `招商公司: ${building.leasing_company ?? "?"}`,
    building.note ? `内部备注: ${building.note}` : null,
    ``,
    `# 配套 (Amenities)`,
    ams.length ? ams.join(", ") : "(无)",
    uniqueAms.length ? `本楼独有/稀缺(同区其他楼少有): ${uniqueAms.join(", ")}` : null,
    ``,
    `# 当前在租`,
    `Active 单元数: ${active.length}`,
    minP ? `价格区间: $${minP.toLocaleString()} - $${maxP?.toLocaleString()}` : "目前没有 active 房源",
    minEff !== Infinity && minEff !== minP ? `最低有效租金 (含 concession): $${(minEff as number).toLocaleString()}/月` : null,
    beds.length ? `可选户型(beds): ${beds.map((b) => (b === 0 ? "Studio" : `${b}BR`)).join(", ")}` : null,
    earliestMoveIn ? `最早入住日期: ${earliestMoveIn}` : null,
    maxConcession ? `最大优惠: ${maxConcession} 个月免租` : null,
    ``,
    `# 通勤到 ${schoolShort}`,
    transit ? `${transit.durationMinutes} 分钟 · 地铁: ${transit.lines.length ? transit.lines.join(" → ") : "(以步行为主)"}` : "(暂无通勤数据)",
    commute?.walking ? `步行 ${commute.walking.durationMinutes} 分钟` : null,
    commute?.driving ? `开车 ${commute.driving.durationMinutes} 分钟` : null,
    ``,
    `# 同区其他楼盘 (用于性价比对比)`,
    peerLines.length ? peerLines.join("\n") : "(同区无其他在租楼盘可对比)",
    positionLine,
  ].filter(Boolean).join("\n");

  const promptHash = crypto.createHash("sha1").update(block).digest("hex").slice(0, 12);
  return { user: block, promptHash };
}

function findCampus(shortName: string) {
  return NYC_CAMPUSES.find((c) => c.shortName === shortName);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = decodeURIComponent(params.slug);
  const body = await req.json().catch(() => ({})) as { school_short?: string; force?: boolean };
  const schoolShort = body.school_short ?? "NYU WSQ";
  const campus = findCampus(schoolShort);
  if (!campus) {
    return Response.json({ error: `unknown school: ${schoolShort}` }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  const db = getSupabaseAdmin();

  // Lookup building
  let building: Building | null = null;
  const { data: b1 } = await db.from("apt_buildings").select("*").eq("building_slug", slug).maybeSingle();
  building = b1 as Building | null;
  if (!building) {
    const { data: b2 } = await db.from("apt_buildings").select("*").eq("id", slug).maybeSingle();
    building = b2 as Building | null;
  }
  if (!building) return Response.json({ error: "building not found" }, { status: 404 });

  // Pull listings + commute + same-area peers in parallel
  const [{ data: listings }, peers] = await Promise.all([
    db
      .from("apt_listings")
      .select("*")
      .eq("building_id", building.id)
      .eq("is_active", true),
    fetchPeers(db, building.area, building.id, schoolShort),
  ]);
  const commute = (((building as unknown as { commutes?: CommuteResult[] }).commutes) ?? [])
    .find((c) => c.campusShortName === schoolShort) ?? null;

  // Build prompt + hash
  const { user, promptHash } = buildPrompt({
    building,
    listings: (listings ?? []) as Listing[],
    commute,
    schoolName: campus.name,
    schoolShort,
    peers,
  });

  // Cache lookup
  if (!body.force) {
    const { data: cached } = await db
      .from("apt_pitch_cache")
      .select("*")
      .eq("building_id", building.id)
      .eq("school_short", schoolShort)
      .eq("language", "zh")
      .maybeSingle();
    if (cached) {
      const ageDays = (Date.now() - new Date(cached.created_at).getTime()) / 86400_000;
      if (cached.prompt_hash === promptHash && ageDays < STALE_AFTER_DAYS) {
        return Response.json({
          body: cached.body,
          cached: true,
          model: cached.model,
          generated_at: cached.created_at,
          school_short: schoolShort,
        });
      }
    }
  }

  // Call Anthropic
  const anthropic = new Anthropic({ apiKey });
  let res;
  try {
    res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      // Lower temp for structured/deterministic brief output. The format is
      // intentionally tabular — we want the model to faithfully list facts,
      // not improvise.
      temperature: 0.3,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "anthropic call failed" },
      { status: 502 }
    );
  }
  const block = res.content[0];
  const text = block && block.type === "text" ? block.text.trim() : "";
  if (!text) return Response.json({ error: "empty response" }, { status: 502 });

  // Upsert cache
  await db
    .from("apt_pitch_cache")
    .upsert({
      building_id: building.id,
      school_short: schoolShort,
      language: "zh",
      body: text,
      model: MODEL,
      prompt_hash: promptHash,
      tokens_in: res.usage?.input_tokens ?? null,
      tokens_out: res.usage?.output_tokens ?? null,
      created_at: new Date().toISOString(),
    }, { onConflict: "building_id,school_short,language" });

  return Response.json({
    body: text,
    cached: false,
    model: MODEL,
    generated_at: new Date().toISOString(),
    school_short: schoolShort,
    tokens: { in: res.usage?.input_tokens, out: res.usage?.output_tokens },
  });
}

/** GET — cheap lookup: returns cached pitch if any, never calls API. */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = decodeURIComponent(params.slug);
  const schoolShort = req.nextUrl.searchParams.get("school_short") ?? "NYU WSQ";
  const db = getSupabaseAdmin();

  let building: Building | null = null;
  const { data: b1 } = await db.from("apt_buildings").select("id").eq("building_slug", slug).maybeSingle();
  building = b1 as Building | null;
  if (!building) {
    const { data: b2 } = await db.from("apt_buildings").select("id").eq("id", slug).maybeSingle();
    building = b2 as Building | null;
  }
  if (!building) return Response.json({ pitch: null }, { status: 200 });

  const { data: cached } = await db
    .from("apt_pitch_cache")
    .select("body, model, created_at, school_short")
    .eq("building_id", building.id)
    .eq("school_short", schoolShort)
    .eq("language", "zh")
    .maybeSingle();
  return Response.json({ pitch: cached ?? null });
}
