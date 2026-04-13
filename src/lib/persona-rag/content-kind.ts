/**
 * 黑魔法多形态输出：同一套 RAG + 人设，按内容类型切换任务描述与篇幅说明。
 * 语言（如 Instagram 用英文）由用户在创作提示中自行说明，不在此硬编码。
 */

import type { RetrievalMode } from "@/lib/persona-rag/retrieve-threshold";

export type PersonaContentKind = "xiaohongshu" | "instagram" | "oral_script";

export function normalizePersonaContentKind(raw: unknown): PersonaContentKind {
  if (raw === "instagram" || raw === "oral_script") return raw;
  return "xiaohongshu";
}

/** 用于 system prompt 中说明「这次要写什么」 */
export function personaContentTaskPhrase(kind: PersonaContentKind): string {
  switch (kind) {
    case "instagram":
      return "Instagram 贴文（Caption）";
    case "oral_script":
      return "短视频口播稿（纯文字台词，可分段换行）";
    default:
      return "小红书笔记";
  }
}

/** 用户拒答话术里的任务名 */
export function personaContentRefusalTaskName(kind: PersonaContentKind): string {
  switch (kind) {
    case "instagram":
      return "Instagram 文案任务";
    case "oral_script":
      return "口播稿任务";
    default:
      return "小红书文案任务";
  }
}

/** Legacy：检索导语里对「参考材料」的称呼 */
export function legacyReferenceMaterialLabel(kind: PersonaContentKind): string {
  switch (kind) {
    case "instagram":
      return "你之前写过或存档的内容片段";
    case "oral_script":
      return "你之前的口播稿或笔记片段（语气与节奏参考；素材可能是口播体）";
    default:
      return "真实笔记";
  }
}

export function legacyExamplesIntro(retrievalMode: RetrievalMode, kind: PersonaContentKind): string {
  const ref = legacyReferenceMaterialLabel(kind);
  if (kind === "instagram") {
    if (retrievalMode === "topic_aligned") {
      return `\n\n下面是${ref}，与本次主题较相关。学语气、节奏与视角；话题与事实以用户指令为准，不要照搬旧案例的具体细节。`;
    }
    if (retrievalMode === "topic_loose") {
      return `\n\n下面是${ref}。本次主题与过去内容不完全重合，请主要当作「我平时怎么写、怎么组织句子」的参考；话题听用户的。`;
    }
    return `\n\n下面是${ref}。本次主题与过去领域可能不同，只学表达习惯与语气，不要把旧话题、旧品牌写进新 Caption。`;
  }
  if (kind === "oral_script") {
    if (retrievalMode === "topic_aligned") {
      return `\n\n下面是${ref}，与本次要讲的内容较相关。用你自己的说话方式写新口播稿，不要照抄旧稿。`;
    }
    if (retrievalMode === "topic_loose") {
      return `\n\n下面是${ref}。本次口播主题可能与过去不重合，主要参考断句、口语感、情绪节奏；内容以用户指令为准。`;
    }
    return `\n\n下面是${ref}。若主题领域不同，只学口吻与口播节奏，不要搬运旧话题与专有信息。`;
  }
  // xiaohongshu — 保持原有文案风格
  if (retrievalMode === "topic_aligned") {
    return `\n\n下面是你之前写过的几篇真实笔记（不是模板，是你的过去作品）。它们和这次要写的主题最相关。看完之后用你自己的方式去写新的一篇——不要照抄，但你的语气、视角、措辞可以从这些过去的作品中自然延续。`;
  }
  if (retrievalMode === "topic_loose") {
    return `\n\n下面是你之前写过的几篇真实笔记。这次用户想写的主题和你过去的作品**不完全重合**，所以请把这些笔记**主要当作"我平时是怎么说话的"参考**——学你的句式、用词、emoji 习惯、自我表达的方式。**话题内容请以用户的需求为准，不要硬把过去的话题搬过来。**`;
  }
  return `\n\n下面是你之前写过的几篇真实笔记。注意：这次用户想写的主题和你过去的作品**完全不在一个领域**，所以这几篇笔记**只用来参考你的说话方式**——句子长短、用词偏好、emoji 习惯、自嘲与对话感、口头禅。**绝对不要把这些笔记里的话题、地点、商品、专业术语带到新笔记里。** 新笔记的主题和内容完全来自用户的需求，你只是用"你的嘴"去写它。`;
}

/** Legacy：包裹单条参考的 XML 标签说明 */
export function legacyNoteXmlTag(kind: PersonaContentKind, index: number): { open: string; close: string } {
  if (kind === "oral_script") {
    return {
      open: `<你的参考片段 ${index}>`,
      close: `</你的参考片段 ${index}>`,
    };
  }
  return {
    open: `<你之前写的笔记 ${index}>`,
    close: `</你之前写的笔记 ${index}>`,
  };
}

/** DNA：风格参考块前的任务一句 */
export function dnaUserTaskLine(kind: PersonaContentKind): string {
  switch (kind) {
    case "instagram":
      return "现在用户会告诉你这次 Instagram 贴文要写什么主题与要点（含语言可在指令里说明）。记住：";
    case "oral_script":
      return "现在用户会告诉你这次口播要讲什么（含时长与语言可在指令里说明）。记住：";
    default:
      return "现在用户会告诉你想写什么主题的小红书笔记。记住：";
  }
}

/** DNA：检索导语（与 oral/ig 微调） */
export function dnaStylePreamble(retrievalMode: RetrievalMode, kind: PersonaContentKind): string {
  if (kind === "instagram") {
    if (retrievalMode === "topic_aligned") {
      return `下面是你以前内容里摘出的句子，与本次主题较接近。可参考语气与切入——但必须写全新 Caption，不要复述旧句。`;
    }
    if (retrievalMode === "topic_loose") {
      return `下面是你以前内容里摘出的句子。这次话题不完全一致，只学「怎么写、怎么断句」；事实与话题以用户指令为准。`;
    }
    return `下面是你以前内容里摘出的句子。若领域不同，只学说话习惯，不要把旧话题、品牌写进新 Caption。`;
  }
  if (kind === "oral_script") {
    if (retrievalMode === "topic_aligned") {
      return `下面是你以前口播稿或笔记里摘出的句子，与本次主题较接近。可参考语气与节奏——但必须写全新口播稿，勿照搬原句。`;
    }
    if (retrievalMode === "topic_loose") {
      return `下面是你以前摘出的句子。这次口播主题可能不同，只学口语节奏与停顿感；内容听用户的。`;
    }
    return `下面是你以前摘出的句子。若主题无关，只学口吻与口播感，勿带旧案例细节。`;
  }
  if (retrievalMode === "topic_aligned") {
    return `下面是你以前写过的几篇笔记里摘出的句子。这次主题比较接近，所以你可以参考当时的语气和切入角度——但必须写全新的内容，不能把下面任何一句搬进新笔记。`;
  }
  if (retrievalMode === "topic_loose") {
    return `下面是你以前写过的几篇笔记里摘出的句子。这次话题不太一样，所以只看你"怎么说话"就好——句子的节奏、用词、emoji 的感觉。话题完全听用户的。`;
  }
  return `下面是你以前写过的几篇笔记里摘出的句子。这次话题完全不同，所以只看说话习惯——断句方式、口头禅、emoji 节奏。不要把下面的任何话题、地名、品牌带到新笔记里。`;
}
