import { getDisplayBoro, getSubAreaForFilter } from "./resolve-area";

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

/** 021 两套基础 INVO 模版（按 build_year 相对「当前日历年」自动二选一） */
export const INVO_ESTABLISHED_TEMPLATE_NAME = "INVO — Established Buildings";
export const INVO_NEW_BUILDINGS_TEMPLATE_NAME = "INVO — New Buildings";

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
 * build_year ≥ 当前日历年 → 新盘模版；否则成熟盘。无有效年份视为成熟盘。
 * 多盘取涉及楼盘中的最大 build_year。
 */
export function invoBaseTemplateNameFromBuildYears(
  years: Array<number | null | undefined>,
  nowYear: number = new Date().getFullYear()
): typeof INVO_ESTABLISHED_TEMPLATE_NAME | typeof INVO_NEW_BUILDINGS_TEMPLATE_NAME {
  const finite = years.filter((y): y is number => y != null && Number.isFinite(y));
  if (finite.length === 0) return INVO_ESTABLISHED_TEMPLATE_NAME;
  return Math.max(...finite) >= nowYear
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

/** 邮件里用 borough 全称（Brooklyn、Bronx…），不缩写 */
function boroughToEmailShort(borough: string): string {
  const t = borough.trim();
  if (t === "Other NJ") return "North NJ";
  return t;
}

/**
 * 单盘：优先行政区全称（Brooklyn、Bronx…），否则解析出的小区名，最后 city。
 */
export function submarketLabelForEmailProperty(
  r: Pick<BatchPropertyForTemplate, "address" | "area" | "city">
): string | null {
  const addr = r.address ?? null;
  const areaField = r.area ?? null;
  const boro = getDisplayBoro(addr, areaField);
  if (boro && boro !== "—" && boro !== "其他") {
    return boroughToEmailShort(boro);
  }
  const sub = getSubAreaForFilter(addr, areaField);
  if (sub && sub.trim()) return sub.trim();
  const c = String(r.city ?? "").trim();
  return c || null;
}

function boroughShortForRow(
  r: Pick<BatchPropertyForTemplate, "address" | "area">
): string | null {
  const boro = getDisplayBoro(r.address ?? null, r.area ?? null);
  if (!boro || boro === "—" || boro === "其他") return null;
  return boroughToEmailShort(boro);
}

/**
 * 最多两个不重复标签：先收「小区」解析名（Williamsburg、South Bronx…），不足再补 Brooklyn/Bronx 等行政区全称，最后 city。
 */
function collectTwoSubmarketLabels(
  top2: BatchPropertyForTemplate[],
  uniq: BatchPropertyForTemplate[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (lab: string | null | undefined) => {
    if (!lab) return;
    const t = lab.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  const trySub = (r: BatchPropertyForTemplate) => {
    const s = getSubAreaForFilter(r.address ?? null, r.area ?? null);
    if (s?.trim()) add(s.trim());
  };

  for (const r of top2) trySub(r);
  for (const r of uniq) {
    if (out.length >= 2) break;
    trySub(r);
  }

  for (const r of top2) {
    if (out.length >= 2) break;
    add(boroughShortForRow(r));
  }
  for (const r of uniq) {
    if (out.length >= 2) break;
    add(boroughShortForRow(r));
  }

  for (const r of uniq) {
    if (out.length >= 2) break;
    add(String(r.city ?? "").trim() || null);
  }

  return out.slice(0, 2);
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
 * 批量发信模版变量：同一开发商选中 ≥2 个楼盘时，intro 用 units 最高的两个盘名 +
 * 两个「小区/行政区」标签（Brooklyn、Bronx、Williamsburg 等，由地址+area 解析，非 DB city）。
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
  const isMulti = uniq.length >= 2;
  const primary = uniq[0];
  const propertyNameSingle = String(primary?.property_name ?? "").trim();
  const propertyNamesJoined = joinEnglishAnd(
    namesTop2.length ? namesTop2 : propertyNameSingle ? [propertyNameSingle] : []
  );

  const subTwo = collectTwoSubmarketLabels(top2, uniq);
  const subJoined = joinEnglishAnd(subTwo);
  /** 占位符 cities_two 历史命名保留，内容为小区/行政区短语 */
  const submarketPhrase = subJoined || "these neighborhoods";

  const property_intro_sentence =
    isMulti && namesTop2.length >= 2
      ? `I came across ${joinEnglishAnd(namesTop2)} and wanted to reach out. We noticed your firm owns many properties across ${submarketPhrase}.`
      : `I came across ${propertyNameSingle} and wanted to reach out.`;

  const leasing_support_phrase =
    isMulti && namesTop2.length >= 2
      ? `leasing and retention goals across ${joinEnglishAnd(namesTop2)}`
      : `${propertyNameSingle}'s leasing and retention goals`;

  /** New Buildings 模版结尾用（无 retention 措辞） */
  const leasing_goals_focus =
    isMulti && namesTop2.length >= 2
      ? `leasing goals across ${joinEnglishAnd(namesTop2)}`
      : `${propertyNameSingle}'s leasing goals`;

  const subject_property_label = propertyNamesJoined || propertyNameSingle;

  return {
    company_name: companyMeta.company_name,
    company_role: companyMeta.company_role,
    property_name: subject_property_label,
    property_names_top2: propertyNamesJoined,
    cities_two: subJoined,
    property_intro_sentence,
    leasing_support_phrase,
    leasing_goals_focus,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
