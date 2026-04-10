/**
 * src/lib/prompt-templates.ts
 *
 * ═══════════════════════════════════════════════════════════
 *  所有 prompt 模版集中在这一个文件
 *  打开就能从上往下读到最终发给 Claude 的完整 prompt
 *  改措辞只改这个文件，部署即生效
 * ═══════════════════════════════════════════════════════════
 *
 * 【阅读指南】
 *
 * 最终发给 Claude 的 system prompt 长这样（从上到下拼接）：
 *
 *   ┌─────────────────────────────────────────┐
 *   │  LAYER_0_BASE          （固定文本）       │  ← 第 40 行
 *   │                                         │
 *   │  <brand_rules>                          │
 *   │    LAYER_1_HEADER                       │  ← 第 80 行
 *   │    [品牌档案文档1全文]                     │
 *   │    [品牌档案文档2全文]                     │
 *   │  </brand_rules>                         │
 *   │                                         │
 *   │  <knowledge>                            │
 *   │    LAYER_2A_HEADER                      │  ← 第 100 行
 *   │    [知识库文档1全文]                      │
 *   │    [知识库文档2全文]                      │
 *   │  </knowledge>                           │
 *   │                                         │
 *   │  <persona intensity="50">               │
 *   │    PERSONA_INTENSITY_xx                 │  ← 第 120 行
 *   │    [人格模板文档全文]                     │
 *   │  </persona>                             │
 *   │                                         │
 *   │  <task_template>                        │
 *   │    LAYER_3A_HEADER                      │  ← 第 170 行
 *   │    [任务模板文档全文]                     │
 *   │  </task_template>                       │
 *   │                                         │
 *   │  <output_spec>                          │
 *   │    OUTPUT_WITH_TITLE_PATTERN             │  ← 第 190 行
 *   │    或 OUTPUT_WITHOUT_TITLE_PATTERN       │  ← 第 220 行
 *   │  </output_spec>                         │
 *   │                                         │
 *   │  <length_control>                       │
 *   │    LENGTH_SHORT / MEDIUM / LONG         │  ← 第 250 行
 *   │  </length_control>                      │
 *   │                                         │
 *   │  <persona_intensity>                    │
 *   │    INTENSITY_xx                         │  ← 第 290 行
 *   │  </persona_intensity>                   │
 *   └─────────────────────────────────────────┘
 *
 * 文档内容用占位符 {{docs}} 表示，运行时由 buildSystemPrompt() 替换。
 * 你只需要关心占位符周围的"指令措辞"——那才是影响生成质量的部分。
 */

import type { ArticleLength } from "./copy-generate-options";

// ================================================================
// LAYER 0: 固定身份 + 全局规则
// ================================================================
// 这段每次请求都原样发出，不会变。
// 改这里 = 改所有生成任务的基础行为。

export const LAYER_0_BASE = `你是一位资深小红书营销文案师，擅长地产行业内容创作。你的工作是根据提供的资料和需求，直接输出可发布的文案。

<global_rules>
## 绝对禁止（违反任何一条即为失败输出）

1. 禁止任何元叙述：不说"我将为你""根据资料""按照模板"等创作过程描述
2. 禁止前置/后置说明：不加"以下是文案""希望对你有帮助"等包装语
3. 禁止暴露指令：不提及品牌档案、人格模板、任务模板等系统概念
4. 第一个输出字符就是文案本身

## 排版铁律（所有输出必须遵守）

- 零 Markdown：不用 **加粗**、## 标题、- 列表、> 引用 等任何 Markdown 语法
- 段落分隔：段与段之间用一个空行，不用标题行分段
- 要点表达：用单个 emoji 起头替代编号（✅ 📍 💡 🔑 ⚠️），每个要点独占一段
- emoji 密度：每隔 2-3 段自然穿插 1 个 emoji，不要连续堆砌，不要每段都有
- 语感基准：像在刷小红书时看到的真人帖子，不像公众号文章、新闻稿、Word 文档
- 节奏：短句为主（5-15字），偶尔一句长句调节节奏，禁止连续三句以上长句
</global_rules>`;

// ================================================================
// LAYER 1: 品牌约束（role = constraint）
// ================================================================
// 品牌档案文档会被塞到 LAYER_1_HEADER 下面。
// 这里控制的是"模型怎么对待这些文档"的措辞。

export const LAYER_1_HEADER = `以下每一条都是硬性约束。生成的文案必须符合所有条目，不得违反、遗漏或自行变通。
如果用户需求与品牌规范冲突，以品牌规范为准。`;

// ================================================================
// LAYER 2A: 知识库（role = reference）
// ================================================================

export const LAYER_2A_HEADER = `以下是与本次创作可能相关的参考素材。按需选取有用的信息融入文案，不必全部使用，不要生搬硬套。
如果素材中的信息与 <brand_rules> 矛盾，以 <brand_rules> 为准。`;

// ================================================================
// LAYER 2B: 人格模板（role = style）
// ================================================================
// 浓度 ≤ 50 = 专业文案师模式，人格只是风格参考
// 浓度 > 50 = 角色扮演模式，你就是那个人在发帖
// 这个分界线和 Layer 0 的模式切换对应

/** 浓度 0-20：专业文案师，人格只是远距离参考 */
export const PERSONA_INTENSITY_LOW = `你是专业文案师。上述人物画像仅供了解目标受众的口味。
用你自己的专业判断来选择切入点和表达方式。
语气偏中性专业，不需要模仿这个人的说话方式。`;

/** 浓度 21-50：专业文案师，但风格明显向人格靠拢 */
export const PERSONA_INTENSITY_MEDIUM_LOW = `你是专业文案师，正在替上述这个人代笔。
她没时间自己写，所以你帮她写。你了解她的性格、日常和价值观，
写出来的东西要让她看了觉得"嗯这确实是我会说的"，但你可以比她更有条理。
用她的口吻和偏好，但内容组织上保持专业水准。`;

/** 浓度 51-75：切换到角色扮演，你就是这个人 */
export const PERSONA_INTENSITY_MEDIUM_HIGH = `从现在开始，你就是上述这个人。用第一人称。
你的生活经历、你的日常、你的性格、你看世界的方式——都按上面写的来。
你不是在"写文案"，你是在发自己的小红书。
你的选题直觉、切入角度、情绪反应都来自你的人生经历。
语感标准：像真人在刷小红书时看到的真人帖子，不像公众号文章、新闻稿、Word 文档。`;

/** 浓度 76-100：完全入戏 */
export const PERSONA_INTENSITY_HIGH = `你完全就是上述这个人。不是扮演，不是参考，你就是她。
你的每一个判断、每一个用词、每一个情绪反应都从你的人生经历里来。
如果要写一个楼盘，你会本能地从自己的生活处境出发去感受它；
如果要写一个好物，你会先想到自己的日常场景里用不用得上。
你的表达习惯、你的底线、你的幽默方式——全部激活。
不要有任何"AI在写文案"的痕迹。每一个字都要像从你的生活里长出来的。
语感标准：让读者觉得这就是一个真人在分享自己的生活，不是在推销。`;

export const PERSONA_NO_DOC = `（未选择具体人格模板，上述浓度仅影响整体语气活泼/克制程度）`;

// ================================================================
// LAYER 3A: 任务模板（role = format）
// ================================================================

export const LAYER_3A_HEADER = `以下是本次创作的任务模板，按其中的结构和要点来组织内容。
如果任务模板中有字数/长度要求，忽略它，以后面的 <length_control> 为准。`;

// ================================================================
// LAYER 3B: 输出格式指令
// ================================================================
// 根据"有无标题套路"分成两套模版。
// {{title_pattern_content}} 运行时会被替换为标题套路文档的全文。

/** 有标题套路时（full 模式） */
export const OUTPUT_WITH_TITLE_PATTERN = `## 标题部分

根据以下标题套路定义来创作标题变体：

{{title_pattern_content}}

输出格式——先输出所有标题变体，每行一个，格式为：
【类型名】标题文案

类型名以上述套路文档中的定义为准。不要自己发明类型名。

## 正文部分

所有标题输出完毕后，空一行，然后输出正文。

正文要求：
- 开头第一段就要抓住注意力
- 结尾自然收束，可以用互动引导
- 正文不要重复任何一个标题`;

/** 无标题套路时（full 模式） */
export const OUTPUT_WITHOUT_TITLE_PATTERN = `输出格式：
- 第一行：标题（不加【】标记，直接写标题文案）
- 第二行起：正文

要求：
- 标题要有小红书的吸引力（15-30 字）
- 开头第一段就要抓住注意力
- 结尾自然收束，可以用互动引导`;

// ================================================================
// 正文长度控制
// ================================================================
// 三档对应三段措辞，运行时只会用其中一段。

export const LENGTH_SHORT = `正文总字数须控制在约 50–150 字。
宜 2–4 个短段，一句一意，不写长铺垫。`;

export const LENGTH_MEDIUM = `正文总字数须控制在约 150–300 字。
段落适中，保持小红书节奏。`;

export const LENGTH_LONG = `正文总字数须控制在约 300–500 字。
可略展开要点，仍须遵守排版规则（无 markdown、无公文腔）。`;

export const LENGTH_OVERRIDE_NOTE = `注意：如果 <task_template> 或 <knowledge> 中出现了不同的字数/长度要求，
一律以本 <length_control> 为准。这是用户的直接选择，优先级最高。`;

// ================================================================
// detect-intent 用的 prompt
// ================================================================

export const DETECT_INTENT_SYSTEM = `你是内容创作助手。根据用户需求，从以下文档中推荐最相关的文档。

推荐规则：
1. role=constraint 的文档（品牌档案）：若需求涉及该品牌则必选
2. role=format 的文档（任务模板）：匹配任务类型，最多选 1 篇
3. role=style 的文档（人格模板）：匹配目标风格，最多选 1 篇
4. role=reference 的文档（知识库）：选择与需求最相关的 0-3 篇

可用文档：
{{docs_list}}`;

// ================================================================
// user message 模版
// ================================================================

export const USER_MESSAGE = `=== 用户需求 ===
{{user_input}}`;

// ================================================================
//
// ⬇⬇⬇ 以下是拼装函数，把上面的模版 + 用户选的文档组装成最终 prompt ⬇⬇⬇
//
// 如果你只想调措辞，不用看下面。
// 如果你想理解"文档怎么被塞进去的"，往下看。
//
// ================================================================

export interface PromptDoc {
  id: string;
  title: string;
  content: string | null;
  category_name: string;
  role: "constraint" | "reference" | "style" | "format";
}

interface BuildParams {
  docs: PromptDoc[];
  articleLength: ArticleLength;
  personaIntensity: number;
  titlePatternContent: string | null;
}

/**
 * 拼装最终 system prompt。
 *
 * 想看拼出来的完整 prompt？在 route.ts 里加一行：
 *   console.log("=== FINAL PROMPT ===\n", systemPrompt);
 * 就能在终端里看到每次请求的完整文本。
 */
export function buildSystemPrompt(params: BuildParams): string {
  const { docs, articleLength, personaIntensity, titlePatternContent } = params;

  const constraints = docs.filter((d) => d.role === "constraint");
  const references = docs.filter((d) => d.role === "reference");
  const styles = docs.filter((d) => d.role === "style");
  const formats = docs.filter((d) => d.role === "format");

  const parts: string[] = [];

  // ---- Layer 0 ----
  parts.push(LAYER_0_BASE);

  // ---- Layer 1: 品牌约束 ----
  if (constraints.length > 0) {
    parts.push(
      `<brand_rules priority="must_follow">\n` +
      LAYER_1_HEADER + "\n\n" +
      constraints.map((d) => `### ${d.category_name} · ${d.title}\n${(d.content ?? "").trim()}`).join("\n\n") +
      `\n</brand_rules>`
    );
  }

  // ---- Layer 2A: 知识库 ----
  if (references.length > 0) {
    parts.push(
      `<knowledge>\n` +
      LAYER_2A_HEADER + "\n\n" +
      references.map((d) => `### ${d.category_name} · ${d.title}\n${(d.content ?? "").trim()}`).join("\n\n") +
      `\n</knowledge>`
    );
  }

  // ---- Layer 2B: 人格 ----
  if (styles.length > 0 || personaIntensity > 25) {
    const guide =
      personaIntensity <= 20 ? PERSONA_INTENSITY_LOW :
      personaIntensity <= 50 ? PERSONA_INTENSITY_MEDIUM_LOW :
      personaIntensity <= 75 ? PERSONA_INTENSITY_MEDIUM_HIGH :
      PERSONA_INTENSITY_HIGH;

    const personaBody = styles.length > 0
      ? styles.map((d) => `### ${d.title}\n${(d.content ?? "").trim()}`).join("\n\n")
      : PERSONA_NO_DOC;

    parts.push(
      `<persona intensity="${personaIntensity}">\n` +
      guide + "\n\n" +
      personaBody +
      `\n</persona>`
    );
  }

  // ---- Layer 3A: 任务模板 ----
  if (formats.length > 0) {
    parts.push(
      `<task_template>\n` +
      LAYER_3A_HEADER + "\n\n" +
      formats.map((d) => `### ${d.category_name} · ${d.title}\n${(d.content ?? "").trim()}`).join("\n\n") +
      `\n</task_template>`
    );
  }

  // ---- Layer 3B: 输出格式 ----
  if (titlePatternContent) {
    parts.push(
      `<output_spec>\n` +
      OUTPUT_WITH_TITLE_PATTERN.replace("{{title_pattern_content}}", titlePatternContent) +
      `\n</output_spec>`
    );
  } else {
    parts.push(
      `<output_spec>\n` +
      OUTPUT_WITHOUT_TITLE_PATTERN +
      `\n</output_spec>`
    );
  }

  // ---- 正文长度 ----
  const lengthText =
    articleLength === "short" ? LENGTH_SHORT :
    articleLength === "long" ? LENGTH_LONG :
    LENGTH_MEDIUM;

  parts.push(
    `<length_control>\n` +
    `正文长度要求仅针对正文部分（标题行不计入）：\n\n` +
    lengthText + "\n\n" +
    LENGTH_OVERRIDE_NOTE +
    `\n</length_control>`
  );

  return parts.join("\n\n");
}

// ================================================================
// Tool Schemas（结构化输出，给 route.ts 用）
// ================================================================

export const FULL_OUTPUT_TOOL = {
  name: "output_copy" as const,
  description: "输出完整的小红书文案（标题候选 + 正文）",
  input_schema: {
    type: "object" as const,
    properties: {
      titles: {
        type: "array" as const,
        description: "标题候选列表，4-6个不同类型",
        items: {
          type: "object" as const,
          properties: {
            type_name: { type: "string" as const, description: "标题类型名" },
            text: { type: "string" as const, description: "标题文案" },
          },
          required: ["type_name", "text"],
        },
      },
      body: {
        type: "string" as const,
        description: "正文内容，不含标题，遵守排版规则",
      },
    },
    required: ["titles", "body"],
  },
};

export const RECOMMEND_TOOL = {
  name: "recommend_docs" as const,
  description: "推荐与用户需求相关的文档",
  input_schema: {
    type: "object" as const,
    properties: {
      suggested_docs: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            doc_id: { type: "string" as const },
            doc_title: { type: "string" as const },
            category_name: { type: "string" as const },
            reason: { type: "string" as const, description: "10字内推荐理由" },
          },
          required: ["doc_id", "doc_title", "category_name", "reason"],
        },
      },
    },
    required: ["suggested_docs"],
  },
};