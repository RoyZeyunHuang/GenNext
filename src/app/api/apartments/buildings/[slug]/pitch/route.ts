import { NextRequest } from "next/server";
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

const SYSTEM = `你是一名经验丰富的纽约华人房产经纪,专门服务来纽约求学的中国学生。
你的工作:为指定的"楼"和"学校"生成一段微信消息,告诉学生家长为什么这栋楼适合这个学校的孩子住。

硬性要求:
- 100-180 字之间的中文,信息密度高,无废话。
- 不要分点编号,不要 Markdown,不用 emoji。
- 必须包含 4 个关键事实:① 通勤时间和地铁线路 ② 价格区间或起价(用 $ 符号写) ③ 楼的卖点(年份/楼层/品牌或一两个 amenity) ④ 当前 active 房源数量或入住时间窗口。
- 语气专业但接地气,像微信里跟熟悉的家长聊天。如果楼有突出优势(超新/泳池/直达学校 等)用一句话突出。
- 只输出中文段落正文,不要前后缀、不要引号、不要 "以下是" 这种标签。`;

type PitchInput = {
  building: Building;
  listings: Listing[];
  commute: CommuteResult | null;
  schoolName: string;
  schoolShort: string;
};

function buildPrompt(p: PitchInput): { user: string; promptHash: string } {
  const { building, listings, commute, schoolName, schoolShort } = p;
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

  const block = [
    `# 学校`,
    `${schoolName} (${schoolShort})`,
    ``,
    `# 楼的基本信息`,
    `名字: ${building.name}`,
    `地址: ${building.address ?? "-"} (${building.neighborhood ?? building.borough ?? ""})`,
    `年份: ${building.year_built ?? "?"}`,
    `层数: ${building.floor_count ?? "?"} 层`,
    `单元总数: ${building.unit_count ?? "?"}`,
    `开发商/招商公司: ${building.leasing_company ?? "?"}`,
    building.note ? `备注: ${building.note}` : null,
    ``,
    `# Amenities`,
    ams.length ? ams.join(", ") : "(无)",
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
    transit ? `${transit.durationMinutes} 分钟 · 地铁线路: ${transit.lines.length ? transit.lines.join(" → ") : "(以步行为主)"}` : "(暂无通勤数据)",
    commute?.walking ? `步行 ${commute.walking.durationMinutes} 分钟` : null,
    commute?.driving ? `开车 ${commute.driving.durationMinutes} 分钟` : null,
  ].filter(Boolean).join("\n");

  // hash for cache invalidation when underlying data shifts
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

  // Pull listings + commute
  const { data: listings } = await db
    .from("apt_listings")
    .select("*")
    .eq("building_id", building.id)
    .eq("is_active", true);
  const commute = (((building as unknown as { commutes?: CommuteResult[] }).commutes) ?? [])
    .find((c) => c.campusShortName === schoolShort) ?? null;

  // Build prompt + hash
  const { user, promptHash } = buildPrompt({
    building,
    listings: (listings ?? []) as Listing[],
    commute,
    schoolName: campus.name,
    schoolShort,
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
      max_tokens: 600,
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
