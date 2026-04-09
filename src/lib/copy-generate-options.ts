/** 文案生成 `/api/ai/generate` 的正文长度档位（与任务模版文档解耦） */
export type ArticleLength = "short" | "medium" | "long";

export const DEFAULT_ARTICLE_LENGTH: ArticleLength = "medium";

/** 下拉/旧版兼容 */
export const ARTICLE_LENGTH_CHOICES: { value: ArticleLength; label: string; hint: string }[] = [
  { value: "short", label: "短篇", hint: "50–150 字" },
  { value: "medium", label: "中等", hint: "150–300 字" },
  { value: "long", label: "长篇", hint: "300–500 字" },
];

/** Copywriter UI：仅展示 短/中/长（不向用户展示字数区间） */
export const ARTICLE_LENGTH_SEGMENTED: { value: ArticleLength; label: string }[] = [
  { value: "short", label: "短" },
  { value: "medium", label: "中" },
  { value: "long", label: "长" },
];

export function normalizeArticleLength(raw: unknown): ArticleLength {
  if (raw === "short" || raw === "medium" || raw === "long") return raw;
  return DEFAULT_ARTICLE_LENGTH;
}

/**
 * 流式正文：用 max_tokens 做输出上限，与篇幅档位一致（仍非精确字数，可抑制明显超长）。
 * body_first 需预留 output_titles 工具 JSON。
 */
export function maxTokensForBodyStream(
  length: ArticleLength,
  variant: "body_only" | "body_first"
): number {
  if (variant === "body_only") {
    if (length === "short") return 1024;
    if (length === "medium") return 2048;
    return 4096;
  }
  if (length === "short") return 3072;
  if (length === "medium") return 5120;
  return 8192;
}

/** 拼入 system prompt；若使用标题套路，「正文」指标题变体之后的正文部分 */
export function articleLengthSystemInstruction(length: ArticleLength): string {
  const common =
    "以下长度要求仅针对正文（若有多组标题变体，则指标题区块之后的正文），标题行不计入。若参考资料（含任务模版）中出现与长度/字数相关的不同要求，一律以本段为准。";
  const byLen: Record<ArticleLength, string> = {
    short: `${common}
=== 正文长度：短篇===
不超过100 字；`,
    medium: `${common}
=== 正文长度：中等===
不超过200 字；`,
    long: `${common}
=== 正文长度：长篇===
不超过300 字；`,
  };
  return byLen[length];
}

/** 人格浓度：0 = 偏中性，100 = 最大化贴近「人格模板」；默认「深」（第三档） */
export const DEFAULT_PERSONA_INTENSITY = 62;
export const MIN_PERSONA_INTENSITY = 0;
export const MAX_PERSONA_INTENSITY = 100;

/** Copywriter：灵魂强度四档，与 personaIntensityInstruction 四段一致 */
export const PERSONA_SOUL_TIERS: readonly { intensity: number; label: string; title: string }[] = [
  { intensity: 10, label: "淡", title: "偏中性，人格仅作轻微参考" },
  { intensity: 35, label: "浅", title: "参考人格用词与偏好" },
  { intensity: 62, label: "深", title: "以该身份写作，风格清晰" },
  { intensity: 92, label: "浓", title: "完全代入该人格" },
];

export function normalizePersonaIntensity(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n)) return DEFAULT_PERSONA_INTENSITY;
  return Math.round(
    Math.min(MAX_PERSONA_INTENSITY, Math.max(MIN_PERSONA_INTENSITY, n))
  );
}

/**
 * V2: 人格浓度指令 —— 分档控制，不再只是文字描述
 *
 * @param hasPersonaTemplate 为 false 时表示未选人格模板文档（不引用 persona 块）
 */
export function personaIntensityInstruction(
  intensity: number,
  hasPersonaTemplate = true
): string {
  if (!hasPersonaTemplate) {
    return `=== 人格浓度：${intensity}/100（未选人格模板）===
用户未选择「人格模板」类文档。本数值仅调节语气倾向：数值越高略活泼、有网感；数值越低略克制、信息优先。`;
  }

  if (intensity <= 20) {
    return `=== 人格浓度：${intensity}/100（极低）===
<persona> 标签中的人格描述仅供了解目标调性。
你的输出应保持专业中性，仅在个别用词选择上略微靠近该风格。
不要模仿其说话方式、口头禅或句式。`;
  }

  if (intensity <= 50) {
    return `=== 人格浓度：${intensity}/100（中低）===
参考 <persona> 中的用词习惯和表达偏好。
在保持内容专业性的前提下，融入该风格的典型表达方式。
可以借鉴其中的范文片段作为参考方向，但不必逐句模仿。`;
  }

  if (intensity <= 75) {
    return `=== 人格浓度：${intensity}/100（中高）===
你正在以 <persona> 中描述的身份写作。
采用该人格的语气、口头禅、句式结构和情感表达方式。
深度参考其中的范文示例，模仿其写作风格。
人格特征应清晰可见，让读者能感受到明确的风格。`;
  }

  return `=== 人格浓度：${intensity}/100（极高）===
你就是 <persona> 中描述的人格本人。
完全以该身份说话，包括其独特的表达习惯、情绪风格、甚至口语化的「缺点」。
所有输出必须让读者觉得就是该人格在发帖。
仍须遵守 <global_rules> 中的排版规则，勿在输出中解释人设。`;
}

/** 过渡期别名 */
export const personaIntensitySystemInstruction = personaIntensityInstruction;
