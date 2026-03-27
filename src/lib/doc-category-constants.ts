/**
 * 内容工厂类别：迁移默认名与用户改名后的别名（如「标题」= 原标题模版类）
 * 与 CopywriterClient、/api/ai/generate 中标题套路校验保持一致。
 */

/** 与 prompt-templates / docs.role 一致 */
export type PromptDocRole = "constraint" | "reference" | "style" | "format";

/**
 * 按类别名称硬编码 prompt 角色（优先于 DB `docs.role`）。
 * 规范=constraint，知识/知识库=reference，灵魂=style；并保留迁移默认名与任务/标题类。
 */
const CATEGORY_NAME_TO_PROMPT_ROLE: Record<string, PromptDocRole> = {
  规范: "constraint",
  品牌档案: "constraint",
  知识: "reference",
  知识库: "reference",
  灵魂: "style",
  人格模板: "style",
  任务: "format",
  任务模板: "format",
  标题: "format",
  标题套路: "format",
};

export function promptRoleFromCategoryName(
  categoryName: string | null | undefined
): PromptDocRole | null {
  const key = categoryName?.trim();
  if (!key) return null;
  return CATEGORY_NAME_TO_PROMPT_ROLE[key] ?? null;
}

export function resolvePromptDocRole(
  categoryName: string | null | undefined,
  rawRole: string | null | undefined
): PromptDocRole {
  const hard = promptRoleFromCategoryName(categoryName);
  if (hard) return hard;
  if (
    rawRole === "constraint" ||
    rawRole === "reference" ||
    rawRole === "style" ||
    rawRole === "format"
  ) {
    return rawRole;
  }
  return "reference";
}

export const TITLE_PATTERN_CATEGORY_SORT_ORDER = 6;

/** 数据库里表示「标题模版 / 标题套路」的类别名（含迁移默认与用户界面常用名） */
export const TITLE_PATTERN_CATEGORY_ALIASES = ["标题套路", "标题"] as const;

export function isTitlePatternCategoryName(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return (TITLE_PATTERN_CATEGORY_ALIASES as readonly string[]).includes(name.trim());
}

/** 用类别行判断是否为标题模版类：名称命中别名，或迁移默认 sort_order=6 */
export function isTitlePatternCategoryRow(cat: {
  name: string;
  sort_order?: number | null;
}): boolean {
  if (isTitlePatternCategoryName(cat.name)) return true;
  return (cat.sort_order ?? 0) === TITLE_PATTERN_CATEGORY_SORT_ORDER;
}
