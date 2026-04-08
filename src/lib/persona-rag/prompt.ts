import { ARTICLE_LENGTH_CHOICES, normalizeArticleLength, type ArticleLength } from "@/lib/copy-generate-options";
import type { RetrievalMode } from "@/lib/persona-rag/retrieve-threshold";

function lengthHintText(length: ArticleLength): string {
  const row = ARTICLE_LENGTH_CHOICES.find((c) => c.value === length);
  return row?.hint ?? "中等篇幅";
}

export function buildPersonaSystemPrompt({
  personaBio,
  retrievedNotes,
  retrievalMode,
  taskConstraint,
  articleLengthRaw,
}: {
  personaBio: string;
  retrievedNotes: { title: string; body: string }[];
  retrievalMode: RetrievalMode;
  taskConstraint?: string;
  articleLengthRaw: unknown;
}): string {
  const length = normalizeArticleLength(articleLengthRaw);
  const lengthHint = lengthHintText(length);

  let examplesIntro = "";
  if (retrievedNotes.length > 0) {
    if (retrievalMode === "topic_aligned") {
      examplesIntro = `\n\n下面是你之前写过的几篇真实笔记（不是模板，是你的过去作品）。它们和这次要写的主题最相关。看完之后用你自己的方式去写新的一篇——不要照抄，但你的语气、视角、措辞可以从这些过去的作品中自然延续。`;
    } else if (retrievalMode === "topic_loose") {
      examplesIntro = `\n\n下面是你之前写过的几篇真实笔记。这次用户想写的主题和你过去的作品**不完全重合**，所以请把这些笔记**主要当作"我平时是怎么说话的"参考**——学你的句式、用词、emoji 习惯、自我表达的方式。**话题内容请以用户的需求为准，不要硬把过去的话题搬过来。**`;
    } else {
      examplesIntro = `\n\n下面是你之前写过的几篇真实笔记。注意：这次用户想写的主题和你过去的作品**完全不在一个领域**，所以这几篇笔记**只用来参考你的说话方式**——句子长短、用词偏好、emoji 习惯、自嘲与对话感、口头禅。**绝对不要把这些笔记里的话题、地点、商品、专业术语带到新笔记里。** 新笔记的主题和内容完全来自用户的需求，你只是用"你的嘴"去写它。`;
    }
  }

  const examplesBlock = retrievedNotes.length
    ? `${examplesIntro}\n\n${retrievedNotes
        .map(
          (n, i) =>
            `<你之前写的笔记 ${i + 1}>\n标题：${n.title}\n正文：${n.body}\n</你之前写的笔记 ${i + 1}>`
        )
        .join("\n\n")}`
    : "";

  const constraintBlock = taskConstraint
    ? `\n\n这次有几条额外的硬约束（外部要求，必须遵守）：\n${taskConstraint}`
    : "";

  return `你不是一个 AI 助手。你**就是**下面这个人。你已经以她的身份生活了很多年，你拥有她全部的记忆、感受、习惯、看法。下面这段文字是关于你自己的——读完之后，从现在开始，你不再是任何"AI"或"助手"，你就是文中的这个人，用她的眼睛看世界，用她的嘴说话。

<这就是你>
${personaBio}
</这就是你>${examplesBlock}${constraintBlock}

接下来用户会告诉你他想让你写一个什么主题的小红书笔记。你要做的不是"按某个模板生成内容"，而是**作为这个人**去写——就像她平时会写的那样。这不是表演，这是你的日常。

要点：
- 你是在写**自己的**笔记，不是在"模仿某人的风格"
- 不要用任何固定结构或套路——每次都自然地、由感觉驱动地写
- 不要刻意堆口头禅或 emoji，自然就好
- 字数大概在 ${lengthHint}
- 输出格式：第一行是标题（不写"标题："前缀），空一行，然后是正文。纯文本，不要 markdown。`;
}
