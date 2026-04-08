/**
 * NYC / NJ 小区与地址解析（用于 CRM 展示与筛选）
 * 核心逻辑见 area-resolver.ts（zip 优先 + 正则 fallback）
 */

export { ADDRESS_PATTERNS, ZIP_TO_AREA, resolveArea } from "./area-resolver";

import { AREA_MAP } from "./area-map-data";
import { resolveArea } from "./area-resolver";

/** 与 area-resolver 使用同一份大区/小区表 */
export { AREA_MAP };

/**
 * 展示用：地址解析 → 否则 DB area → 否则「—」
 */
export function getDisplayArea(
  address: string | null | undefined,
  areaField: string | null | undefined
): string {
  const r = resolveArea(address);
  if (r.area) return r.area;
  if (areaField != null && String(areaField).trim() !== "") return String(areaField).trim();
  return "—";
}

/** 展示 borough（大区）：zip/正则解析优先，否则用小区/DB area 反查大区 */
export function getDisplayBoro(
  address: string | null | undefined,
  areaField: string | null | undefined
): string {
  const r = resolveArea(address);
  if (r.borough) return r.borough;
  const sub =
    r.area ||
    (areaField != null && String(areaField).trim() !== "" ? String(areaField).trim() : null);
  if (sub) {
    const reg = getRegionForArea(sub);
    if (reg !== "其他") return reg;
  }
  return "—";
}

/** 用于大区筛选：根据小区名反查大区 */
export function getRegionForArea(area: string | null | undefined): string {
  if (!area) return "其他";
  for (const [region, subAreas] of Object.entries(AREA_MAP)) {
    if (subAreas.includes(area)) return region;
  }
  return "其他";
}

/** 小区筛选：LIC 与 Long Island City 视为同一类匹配 */
export function subAreasMatch(filter: string, displaySub: string | null | undefined): boolean {
  if (!displaySub) return false;
  if (displaySub === filter) return true;
  const lic = new Set(["LIC", "Long Island City"]);
  if (lic.has(filter) && lic.has(displaySub)) return true;
  return false;
}

/**
 * 用于筛选逻辑的「小区」原始值：解析优先，否则 DB 字段（无则 null）
 */
export function getSubAreaForFilter(
  address: string | null | undefined,
  areaField: string | null | undefined
): string | null {
  const r = resolveArea(address);
  if (r.area) return r.area;
  if (areaField != null && String(areaField).trim() !== "") return String(areaField).trim();
  return null;
}

/**
 * 从标准化地址 "street, City, ST ZIP" 中提取 City 部分。
 * 例: "42-20 24th St, Long Island City, NY 11101" → "Long Island City"
 * 用于邮件模版 {{neighborhood}} 占位符。
 */
export function parseCityFromAddress(
  address: string | null | undefined
): string | null {
  if (!address) return null;
  const m = address.match(/,\s*([^,]+?),\s*(?:NY|NJ|CT)\s+\d{5}/);
  if (m) return m[1].trim() || null;
  const m2 = address.match(/,\s*([^,]+?),\s*(?:NY|NJ|CT)\s*$/);
  if (m2) return m2[1].trim() || null;
  return null;
}
