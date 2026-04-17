/**
 * 实体 resolver：接受自然语言 / name / id / slug 任何形式，返回 found | ambiguous | not_found。
 *
 * 这是架构原则 1 的执行层：AI 无需维护 ID 状态，直接传用户说的词即可。
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Candidate } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export type ResolvedPersona = {
  id: string;
  name: string | null;
  bio_md: string | null;
  user_id: string | null;
  is_public: boolean;
};

export type PersonaResolution =
  | { kind: "found"; persona: ResolvedPersona }
  | { kind: "ambiguous"; candidates: Candidate[] }
  | { kind: "not_found" };

/**
 * Persona resolver：按 id → name 精确 → name ilike 模糊 尝试。
 * 只在用户自己的 + public 人格里找。
 */
export async function resolvePersona(
  key: string,
  opts: { userId: string }
): Promise<PersonaResolution> {
  const q = key.trim();
  if (!q) return { kind: "not_found" };
  const admin = getSupabaseAdmin();

  // 1. UUID 精确
  if (isUuid(q)) {
    const { data } = await admin
      .from("personas")
      .select("id, name, bio_md, user_id, is_public")
      .eq("id", q)
      .maybeSingle();
    if (data) return { kind: "found", persona: data as ResolvedPersona };
  }

  // 权限范围：自己 + public
  const scope = `user_id.eq.${opts.userId},is_public.eq.true`;

  // 2. name 精确（大小写不敏感）
  {
    const { data } = await admin
      .from("personas")
      .select("id, name, bio_md, user_id, is_public")
      .or(scope)
      .ilike("name", q)
      .limit(5);
    const rows = (data ?? []) as ResolvedPersona[];
    if (rows.length === 1) return { kind: "found", persona: rows[0] };
    if (rows.length > 1) {
      return {
        kind: "ambiguous",
        candidates: rows.map((r) => ({
          id: r.id,
          label: r.name ?? "(无名)",
          hint: (r.bio_md ?? "").slice(0, 60),
        })),
      };
    }
  }

  // 3. name 模糊
  {
    const esc = q.replace(/[%,]/g, "");
    const { data } = await admin
      .from("personas")
      .select("id, name, bio_md, user_id, is_public")
      .or(scope)
      .ilike("name", `%${esc}%`)
      .limit(6);
    const rows = (data ?? []) as ResolvedPersona[];
    if (rows.length === 1) return { kind: "found", persona: rows[0] };
    if (rows.length > 1) {
      return {
        kind: "ambiguous",
        candidates: rows.map((r) => ({
          id: r.id,
          label: r.name ?? "(无名)",
          hint: (r.bio_md ?? "").slice(0, 60),
        })),
      };
    }
  }

  return { kind: "not_found" };
}

export type ResolvedBuilding = {
  id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  neighborhood: string | null;
  area: string;
  building_slug: string | null;
  year_built: number | null;
  amenities: string[] | null;
  image_url: string | null;
  subways: unknown;
  schools: unknown;
  description: string | null;
  active_rentals_count: number | null;
};

export type BuildingResolution =
  | { kind: "found"; building: ResolvedBuilding }
  | { kind: "ambiguous"; candidates: Candidate[] }
  | { kind: "not_found" };

const BUILDING_COLS = [
  "id",
  "name",
  "short_name",
  "address",
  "neighborhood",
  "area",
  "building_slug",
  "year_built",
  "amenities",
  "image_url",
  "subways",
  "schools",
  "description",
  "active_rentals_count",
].join(", ");

/**
 * Building resolver：按 id / slug 精确 → name/short_name/address 分词 ilike。
 */
export async function resolveBuilding(key: string): Promise<BuildingResolution> {
  const q = key.trim();
  if (!q) return { kind: "not_found" };
  const admin = getSupabaseAdmin();

  // 1. id 精确（apt_buildings.id 是 StreetEasy building_id，纯数字字符串）
  {
    const { data } = await admin
      .from("apt_buildings")
      .select(BUILDING_COLS)
      .eq("id", q)
      .maybeSingle();
    if (data) return { kind: "found", building: data as unknown as ResolvedBuilding };
  }

  // 2. slug 精确
  {
    const { data } = await admin
      .from("apt_buildings")
      .select(BUILDING_COLS)
      .eq("building_slug", q)
      .maybeSingle();
    if (data) return { kind: "found", building: data as unknown as ResolvedBuilding };
  }

  // 3. name 精确（忽略大小写，忽略首尾空格）
  {
    const { data } = await admin
      .from("apt_buildings")
      .select(BUILDING_COLS)
      .ilike("name", q)
      .limit(5);
    const rows = (data ?? []) as unknown as ResolvedBuilding[];
    if (rows.length === 1) return { kind: "found", building: rows[0] };
    if (rows.length > 1) {
      return { kind: "ambiguous", candidates: rows.map(buildingToCandidate) };
    }
  }

  // 4. 分词 ILIKE：把 q 按空格拆成 token，任一 token 命中 name / short_name / neighborhood / address
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim().replace(/[%,]/g, ""))
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return { kind: "not_found" };
  const orClauses: string[] = [];
  for (const t of tokens) {
    const p = `%${t}%`;
    orClauses.push(
      `name.ilike.${p}`,
      `short_name.ilike.${p}`,
      `neighborhood.ilike.${p}`,
      `address.ilike.${p}`
    );
  }
  const { data } = await admin
    .from("apt_buildings")
    .select(BUILDING_COLS)
    .eq("is_tracked", true)
    .or(orClauses.join(","))
    .order("active_rentals_count", { ascending: false, nullsFirst: false })
    .limit(8);
  const rows = (data ?? []) as unknown as ResolvedBuilding[];
  if (rows.length === 0) return { kind: "not_found" };

  // 如果 name 全匹配某 token → 唯一胜出
  const strong = rows.filter((r) =>
    tokens.some(
      (t) =>
        (r.name ?? "").toLowerCase() === t.toLowerCase() ||
        (r.short_name ?? "").toLowerCase() === t.toLowerCase()
    )
  );
  if (strong.length === 1) return { kind: "found", building: strong[0] };

  if (rows.length === 1) return { kind: "found", building: rows[0] };
  return { kind: "ambiguous", candidates: rows.map(buildingToCandidate) };
}

function buildingToCandidate(r: ResolvedBuilding): Candidate {
  const loc = r.neighborhood ?? r.area ?? "";
  return {
    id: r.building_slug ?? r.id,
    label: r.name,
    hint: [loc, r.address ?? ""].filter(Boolean).join(" · "),
  };
}
