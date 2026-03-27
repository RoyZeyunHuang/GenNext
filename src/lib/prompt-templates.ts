/**
 * 所有 prompt 模版集中在此；`buildSystemPrompt()` 运行时拼装发给 Claude 的 system prompt。
 * 分阶段逻辑见 PromptBuildParams.mode。
 */

import type { ArticleLength } from "./copy-generate-options";
import { isTitlePatternCategoryName } from "./doc-category-constants";

// ================================================================
// LAYER 0: 固定身份 + 全局规则
// ================================================================

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
- emoji 密度：每隔 2-3 段自然穿插 1 个 emoji，不要连续堆砌，不要每段都有，但是可以当bullet points来用
- 语感基准：像在刷小红书时看到的真人帖子，不像公众号文章、新闻稿、Word 文档
- 节奏：短句为主（5-15字），偶尔一句长句调节节奏，禁止连续三句以上长句
</global_rules>`;

export const LAYER_1_HEADER = `以下每一条都是硬性约束。生成的文案必须符合所有条目，不得违反、遗漏或自行变通。
如果用户需求与品牌规范冲突，以品牌规范为准。`;

export const LAYER_2A_HEADER = `以下是与本次创作可能相关的参考素材。按需选取有用的信息融入文案，不必全部使用，不要生搬硬套。
如果素材中的信息与 <brand_rules> 矛盾，以 <brand_rules> 为准。`;

export const PERSONA_INTENSITY_LOW = `你是专业文案师。上述人物画像仅供了解目标受众的口味。
用你自己的专业判断来选择切入点和表达方式。
语气偏中性专业，不需要模仿这个人的说话方式。`;

export const PERSONA_INTENSITY_MEDIUM_LOW = `你是专业文案师，正在替上述这个人代笔。
她没时间自己写，所以你帮她写。你了解她的性格、日常和价值观，
写出来的东西要让她看了觉得"嗯这确实是我会说的"，但你可以比她更有条理。
用她的口吻和偏好，但内容组织上保持专业水准。`;

export const PERSONA_INTENSITY_MEDIUM_HIGH = `从现在开始，你就是上述这个人。用第一人称。
你的生活经历、你的日常、你的性格、你看世界的方式——都按上面写的来。
你不是在"写文案"，你是在发自己的小红书。
你的选题直觉、切入角度、情绪反应都来自你的人生经历。
语感标准：像真人在刷小红书时看到的真人帖子，不像公众号文章、新闻稿、Word 文档。`;

export const PERSONA_INTENSITY_HIGH = `你完全就是上述这个人。不是扮演，不是参考，你就是她。
你的每一个判断、每一个用词、每一个情绪反应都从你的人生经历里来。
如果要写一个楼盘，你会本能地从自己的生活处境出发去感受它；
如果要写一个好物，你会先想到自己的日常场景里用不用得上。
你的表达习惯、你的底线、你的幽默方式——全部激活。
不要有任何"AI在写文案"的痕迹。每一个字都要像从你的生活里长出来的。
语感标准：让读者觉得这就是一个真人在分享自己的生活，不是在推销。`;

export const PERSONA_NO_DOC = `（未选择具体人格模板，上述浓度仅影响整体语气活泼/克制程度）`;

export const LAYER_3A_HEADER = `以下是本次创作的任务模板，按其中的结构和要点来组织内容。
如果任务模板中有字数/长度要求，忽略它，以后面的 <length_control> 为准。`;

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

export const OUTPUT_WITHOUT_TITLE_PATTERN = `输出格式：
- 第一行：标题（不加【】标记，直接写标题文案）
- 第二行起：正文

要求：
- 标题要有小红书的吸引力（15-30 字）
- 开头第一段就要抓住注意力
- 结尾自然收束，可以用互动引导`;

export const LENGTH_SHORT = `正文总字数须控制在约 50–150 字。
宜 2–4 个短段，一句一意，不写长铺垫。`;

export const LENGTH_MEDIUM = `正文总字数须控制在约 150–300 字。
段落适中，保持小红书节奏。`;

export const LENGTH_LONG = `正文总字数须控制在约 300–500 字。
可略展开要点，仍须遵守排版规则（无 markdown、无公文腔）。`;

export const LENGTH_OVERRIDE_NOTE = `注意：如果 <task_template> 或 <knowledge> 中出现了不同的字数/长度要求，
一律以本 <length_control> 为准。这是用户的直接选择，优先级最高。`;

export const DETECT_INTENT_SYSTEM = `你是内容创作助手。根据用户需求，从以下文档中推荐最相关的文档。

推荐规则：
1. role=constraint 的文档（品牌档案）：若需求涉及该品牌则必选
2. role=format 的文档（任务模板）：匹配任务类型，最多选 1 篇
3. role=style 的文档（人格模板）：匹配目标风格，最多选 1 篇
4. role=reference 的文档（知识库）：选择与需求最相关的 0-3 篇

可用文档：
{{docs_list}}`;

export const USER_MESSAGE = `=== 用户需求 ===
{{user_input}}`;

export function buildDetectIntentSystemPrompt(docsListLines: string): string {
  return DETECT_INTENT_SYSTEM.replace("{{docs_list}}", docsListLines);
}

export function buildUserMessageBody(userInput: string): string {
  return USER_MESSAGE.replace("{{user_input}}", userInput.trim() || "无具体需求");
}

// ================================================================
// Types & builder
// ================================================================

export interface PromptDoc {
  id: string;
  title: string;
  content: string | null;
  category_name: string;
  role: "constraint" | "reference" | "style" | "format";
  priority?: number;
}

export interface PromptBuildParams {
  docs: PromptDoc[];
  articleLength: ArticleLength;
  personaIntensity: number;
  titlePatternContent: string | null;
  /** body_first：先出正文；titles_from_body：据正文出标题；titles_only：仅按需求出标题（少用） */
  mode: "titles_only" | "titles_from_body" | "body_first" | "body_only" | "full";
  selectedTitle?: string;
  /** titles_from_body：用户消息里会带正文，此处与之一致 */
  existingBody?: string;
}

function personaGuideForIntensity(personaIntensity: number): string {
  if (personaIntensity <= 20) return PERSONA_INTENSITY_LOW;
  if (personaIntensity <= 50) return PERSONA_INTENSITY_MEDIUM_LOW;
  if (personaIntensity <= 75) return PERSONA_INTENSITY_MEDIUM_HIGH;
  return PERSONA_INTENSITY_HIGH;
}

function lengthBlock(articleLength: ArticleLength): string {
  const lengthText =
    articleLength === "short" ? LENGTH_SHORT : articleLength === "long" ? LENGTH_LONG : LENGTH_MEDIUM;
  return (
    `<length_control priority="must_follow">\n` +
    `【硬性约束】以下为用户选择的正文篇幅；生成正文时必须遵守，明显超长或明显过短均视为不合格。\n` +
    `字数仅统计正文（标题行、标题变体、前言结语均不计入）。\n\n` +
    lengthText +
    "\n\n" +
    LENGTH_OVERRIDE_NOTE +
    `\n</length_control>`
  );
}

/** 嵌入 output_spec，避免模型只看后面长文档而忽略篇幅 */
function lengthOneLiner(articleLength: ArticleLength): string {
  if (articleLength === "short") return "正文总字数约 50–150 字（宜 2–4 短段）。";
  if (articleLength === "long") return "正文总字数约 300–500 字（可略展开，勿写成千字长文）。";
  return "正文总字数约 150–300 字（保持小红书节奏）。";
}

/**
 * 拼装最终 system prompt（含 body_first / titles_from_body / titles_only / body_only / full）。
 */
export function buildSystemPrompt(params: PromptBuildParams): string {
  const { docs, articleLength, personaIntensity, titlePatternContent, mode, selectedTitle } = params;

  const constraints = [...docs.filter((d) => d.role === "constraint")].sort(
    (a, b) => (b.priority ?? 3) - (a.priority ?? 3)
  );
  const references = docs.filter((d) => d.role === "reference");
  const styles = docs.filter((d) => d.role === "style");
  const formats = docs.filter((d) => d.role === "format");
  const taskFormats = formats.filter((d) => !isTitlePatternCategoryName(d.category_name));

  const parts: string[] = [];

  parts.push(LAYER_0_BASE);

  if (constraints.length > 0) {
    parts.push(
      `<brand_rules priority="must_follow">\n` +
        LAYER_1_HEADER +
        "\n\n" +
        constraints
          .map((d) => `### ${d.category_name} · ${d.title}\n${(d.content ?? "").trim()}`)
          .join("\n\n") +
        `\n</brand_rules>`
    );
  }

  if (references.length > 0) {
    parts.push(
      `<knowledge>\n` +
        LAYER_2A_HEADER +
        "\n\n" +
        references
          .map((d) => `### ${d.category_name} · ${d.title}\n${(d.content ?? "").trim()}`)
          .join("\n\n") +
        `\n</knowledge>`
    );
  }

  if (styles.length > 0 || personaIntensity > 25) {
    const guide = personaGuideForIntensity(personaIntensity);
    const personaBody =
      styles.length > 0
        ? styles.map((d) => `### ${d.title}\n${(d.content ?? "").trim()}`).join("\n\n")
        : PERSONA_NO_DOC;

    parts.push(
      `<persona intensity="${personaIntensity}">\n` + guide + "\n\n" + personaBody + `\n</persona>`
    );
  }

  if (taskFormats.length > 0) {
    parts.push(
      `<task_template>\n` +
        LAYER_3A_HEADER +
        "\n\n" +
        taskFormats
          .map((d) => `### ${d.category_name} · ${d.title}\n${(d.content ?? "").trim()}`)
          .join("\n\n") +
        `\n</task_template>`
    );
  }

  if (mode === "titles_from_body") {
    // 正文只在用户消息里出现一次，避免与 route 中 userMessage 重复导致输入翻倍、极慢
    const stageNote =
      `【本阶段范围】仅生成标题候选（通过工具 output_titles 输出），不要改写或重复粘贴正文。\n` +
      `已写正文在用户消息的「=== 已写正文」段落中；标题须贴合该正文的内容与语气；若与正文事实冲突，以正文为准。\n\n`;
    if (titlePatternContent) {
      parts.push(
        `<title_guide>\n${stageNote}` +
          `请根据以下标题套路，为上述正文生成多个不同类型的标题候选。\n\n${titlePatternContent}\n\n` +
          `类型名以上述套路文档中的定义为准。\n` +
          `</title_guide>`
      );
    } else {
      parts.push(
        `<title_guide>\n${stageNote}` +
          `请根据用户消息中的正文，生成多个风格各异的小红书标题候选（类型可自拟）。\n` +
          `</title_guide>`
      );
    }
    return parts.join("\n\n");
  }

  if (mode === "titles_only") {
    const stageNote =
      `【本阶段范围】仅生成标题候选，不要写正文、不要输出任何正文段落。\n` +
      `下方任务模板等资料供你把握选题方向；最终只通过工具输出 titles 列表。\n\n`;
    if (titlePatternContent) {
      parts.push(
        `<title_guide>\n${stageNote}` +
          `请根据以下标题套路定义来创作标题变体：\n\n${titlePatternContent}\n\n` +
          `为用户需求生成多个不同类型的标题候选。类型名称以上述套路文档中的定义为准。\n` +
          `</title_guide>`
      );
    } else {
      parts.push(
        `<title_guide>\n${stageNote}` +
          `请为用户需求生成多个风格各异的小红书标题候选。\n` +
          `可以包含悬念式、数字式、痛点式、对比式、情感式等不同类型。\n` +
          `</title_guide>`
      );
    }
    return parts.join("\n\n");
  }

  if (mode === "body_first") {
    parts.push(
      `<output_spec>\n` +
        `**篇幅（必须遵守）**：${lengthOneLiner(articleLength)}\n` +
        `先用纯文本输出完整正文（不要标题行；不要写「标题」「Title」等字样；不要与正文无关的前言或结语）。\n` +
        `正文结束后，**必须**调用一次工具 output_titles，根据你刚写的正文生成标题候选（见下方 title_guide）。\n` +
        `不要仅在对话里输出标题列表而不调用工具；也不要在正文文本里夹带标题列表。\n` +
        `</output_spec>`
    );
    if (titlePatternContent) {
      parts.push(
        `<title_guide>\n` +
          `标题须贴合你刚写的正文；若与正文事实冲突，以正文为准。\n\n` +
          `请根据以下标题套路，为上述正文生成多个不同类型的标题候选。\n\n${titlePatternContent}\n\n` +
          `类型名以上述套路文档中的定义为准。\n` +
          `</title_guide>`
      );
    } else {
      parts.push(
        `<title_guide>\n` +
          `标题须贴合你刚写的正文。\n` +
          `请根据正文生成多个风格各异的小红书标题候选（类型可自拟）。\n` +
          `</title_guide>`
      );
    }
    parts.push(lengthBlock(articleLength));
    return parts.join("\n\n");
  }

  if (mode === "body_only") {
    parts.push(
      `<output_spec>\n` +
        `已选定标题：${selectedTitle ?? ""}\n\n` +
        `**篇幅（必须遵守）**：${lengthOneLiner(articleLength)} 请为上述标题撰写小红书正文；直接输出正文，不要重复标题行。\n` +
        `</output_spec>`
    );
    parts.push(lengthBlock(articleLength));
    return parts.join("\n\n");
  }

  // full
  if (titlePatternContent) {
    parts.push(
      `<output_spec>\n` +
        OUTPUT_WITH_TITLE_PATTERN.replace("{{title_pattern_content}}", titlePatternContent) +
        `\n</output_spec>`
    );
  } else {
    parts.push(`<output_spec>\n` + OUTPUT_WITHOUT_TITLE_PATTERN + `\n</output_spec>`);
  }

  parts.push(lengthBlock(articleLength));

  return parts.join("\n\n");
}

// ================================================================
// Tool Schemas（route.ts）
// ================================================================

export const TITLE_OUTPUT_TOOL = {
  name: "output_titles" as const,
  description:
    "在正文纯文本输出完成后调用：根据你刚写的正文生成标题候选（须贴合 title_guide 与用户需求；单独请求时则贴合用户消息中的已写正文）",
  input_schema: {
    type: "object" as const,
    properties: {
      titles: {
        type: "array" as const,
        description: "标题候选列表，3-6个",
        items: {
          type: "object" as const,
          properties: {
            type_name: { type: "string" as const, description: "标题类型名" },
            text: { type: "string" as const, description: "标题文案" },
          },
          required: ["type_name", "text"],
        },
      },
    },
    required: ["titles"],
  },
};

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
