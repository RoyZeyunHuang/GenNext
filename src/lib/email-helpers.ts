import { parseCityFromAddress } from "./resolve-area";

export type CompanyWithContacts = {
  id: string;
  name: string;
  email?: string | null;
  contacts?: Array<{
    name: string;
    email?: string | null;
    is_primary?: boolean | null;
  }> | null;
};

export function resolveRecipientEmail(company: CompanyWithContacts): string | null {
  const contacts = company.contacts ?? [];
  const primary = contacts.find((c) => c.is_primary && c.email?.trim());
  if (primary?.email) return primary.email.trim();
  const any = contacts.find((c) => c.email?.trim());
  if (any?.email) return any.email.trim();
  if (company.email?.trim()) return company.email.trim();
  return null;
}

export function resolveContactName(company: CompanyWithContacts): string {
  const contacts = company.contacts ?? [];
  const primary = contacts.find((c) => c.is_primary);
  if (primary?.name) return primary.name;
  return contacts[0]?.name ?? "there";
}

/**
 * 邮件称呼用：只取联系人名字的第一段（first name），避免全文写全名。
 * 例："Gabrielle Panepinto Reiser" → "Gabrielle"
 */
export function contactFirstName(
  name: string | null | undefined,
  fallback = "there"
): string {
  const s = (name ?? "").trim();
  if (!s) return fallback;
  const first = s.split(/\s+/)[0] ?? "";
  return first || fallback;
}

export function applyTemplate(
  text: string,
  vars: Record<string, string>
): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

/** 021 两套基础 INVO 模版（按 build_year 相对固定阈值自动二选一） */
export const INVO_ESTABLISHED_TEMPLATE_NAME = "INVO — Established Buildings";
export const INVO_NEW_BUILDINGS_TEMPLATE_NAME = "INVO — New Buildings";

/**
 * 新盘 vs 成熟盘的 build_year 阈值。
 * 当前规则：build_year ≥ 2025 视为新盘，< 2025 视为成熟盘。
 * 以后要调规则（比如换成「当前年」），改这个常量即可，所有计算走同一处。
 */
export const INVO_NEW_BUILDING_YEAR_THRESHOLD = 2025;

const INVO_MANAGED_TEMPLATE_NAMES = new Set([
  INVO_ESTABLISHED_TEMPLATE_NAME,
  INVO_NEW_BUILDINGS_TEMPLATE_NAME,
  "INVO — Established Buildings — Multi",
  "INVO — New Buildings — Multi",
]);

/** 是否属于上述四套之一（选中时由 build year 自动落到 Established / New 基础款再套 Multi） */
export function isInvoManagedEmailTemplateName(name: string | null | undefined): boolean {
  const n = name?.trim();
  return Boolean(n && INVO_MANAGED_TEMPLATE_NAMES.has(n));
}

/**
 * build_year ≥ INVO_NEW_BUILDING_YEAR_THRESHOLD → 新盘模版；否则成熟盘。无有效年份视为成熟盘。
 * 多盘取涉及楼盘中的最大 build_year。
 */
export function invoBaseTemplateNameFromBuildYears(
  years: Array<number | null | undefined>,
  thresholdYear: number = INVO_NEW_BUILDING_YEAR_THRESHOLD
): typeof INVO_ESTABLISHED_TEMPLATE_NAME | typeof INVO_NEW_BUILDINGS_TEMPLATE_NAME {
  const finite = years.filter((y): y is number => y != null && Number.isFinite(y));
  if (finite.length === 0) return INVO_ESTABLISHED_TEMPLATE_NAME;
  return Math.max(...finite) >= thresholdYear
    ? INVO_NEW_BUILDINGS_TEMPLATE_NAME
    : INVO_ESTABLISHED_TEMPLATE_NAME;
}

/** 021 基础模版 name → 同一开发商多盘专用模版 name（库内由 024 migration 插入） */
export const INVO_MULTI_DEVELOPER_TEMPLATE_BY_BASE: Record<string, string> = {
  [INVO_ESTABLISHED_TEMPLATE_NAME]: "INVO — Established Buildings — Multi",
  [INVO_NEW_BUILDINGS_TEMPLATE_NAME]: "INVO — New Buildings — Multi",
};

export function resolveInvoMultiDeveloperTemplateName(
  baseTemplateName: string | undefined | null
): string | null {
  const n = baseTemplateName?.trim();
  if (!n) return null;
  return INVO_MULTI_DEVELOPER_TEMPLATE_BY_BASE[n] ?? null;
}

/**
 * 批量预览：合并为同一开发商一封时自动换用 — Multi 模版；单盘仍用所选模版。
 */
export function pickInvoMultiDeveloperEmailTemplate<
  T extends { id: string; name: string; subject: string; body: string },
>(merged: boolean, selected: T, all: T[]): T {
  if (!merged) return selected;
  const multiName = resolveInvoMultiDeveloperTemplateName(selected.name);
  if (!multiName) return selected;
  return all.find((t) => t.name === multiName) ?? selected;
}

/** 英文列举：A and B / A, B, and C */
export function joinEnglishAnd(parts: string[]): string {
  const cleaned = parts.map((p) => String(p).trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

export type BatchPropertyForTemplate = {
  property_id: string;
  property_name: string;
  units?: number | null;
  city?: string | null;
  /** 用于解析小区 / 行政区（Brooklyn、Bronx 等，邮件里写全称） */
  address?: string | null;
  area?: string | null;
  build_year?: number | null;
  company_role?: string;
};

/** 从楼盘行提取 city：优先从地址解析，其次 DB city 字段 */
function cityForRow(
  r: Pick<BatchPropertyForTemplate, "address" | "city">
): string | null {
  return (
    parseCityFromAddress(r.address) ||
    (r.city ? String(r.city).trim() : null) ||
    null
  );
}

/**
 * 遍历按 units 降序排列的楼盘，取前两个**不同** city。
 * 若第 1、2 个楼盘 city 相同则顺延到下一个不同的。
 */
function collectTwoCities(uniq: BatchPropertyForTemplate[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of uniq) {
    if (out.length >= 2) break;
    const c = cityForRow(r);
    if (!c) continue;
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function sortPropertyRowsByUnits<T extends { units?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.units ?? -1) - (a.units ?? -1));
}

/** 同一公司下多行去重 property_id，保留 units 较高的一条 */
export function dedupePropertiesByIdPreferHigherUnits<
  T extends { property_id: string; units?: number | null },
>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of sortPropertyRowsByUnits(rows)) {
    const id = r.property_id;
    if (!byId.has(id)) byId.set(id, r);
  }
  return Array.from(byId.values()).sort((a, b) => (b.units ?? -1) - (a.units ?? -1));
}

/**
 * 批量发信模版变量（multi 和 single 用同一套模版，区别只是变量值）：
 * - property_name: 单楼 = 楼名，多楼 = "A and B"（units 最高的两个）
 * - neighborhood: 单楼 = primary city，多楼 = "CityA and CityB"（前两个不同 city）
 */
export function buildDeveloperBatchTemplateVars(
  rows: BatchPropertyForTemplate[],
  companyMeta: { company_name: string; company_role: string }
): Record<string, string> {
  const uniq = dedupePropertiesByIdPreferHigherUnits(rows);
  const top2 = uniq.slice(0, 2);
  const namesTop2 = top2
    .map((r) => String(r.property_name ?? "").trim())
    .filter(Boolean);
  const primary = uniq[0];
  const propertyNameSingle = String(primary?.property_name ?? "").trim();
  const propertyNamesJoined = joinEnglishAnd(
    namesTop2.length ? namesTop2 : propertyNameSingle ? [propertyNameSingle] : []
  );

  const citiesTwo = collectTwoCities(uniq);
  const neighborhood = joinEnglishAnd(citiesTwo) || cityForRow(primary!) || "the area";

  return {
    company_name: companyMeta.company_name,
    company_role: companyMeta.company_role,
    property_name: propertyNamesJoined || propertyNameSingle,
    neighborhood,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
