/**
 * 程序化风格指纹提取：从范文中分析可量化的写作风格特征。
 *
 * 目的：让 prompt 可以用"风格参考卡"替代（或补充）原文注入，
 * 减少模型对范文内容的过度依赖，真正做到"学风格不搬内容"。
 */

type NoteInput = { title: string; body: string };

/* ────────── 内部工具 ────────── */

/** 按中文标点 + 换行拆句（简单但够用） */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？…～\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 判断码点是否属于常见 emoji 范围 */
function isEmojiCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1f300 && cp <= 0x1f9ff) || // Misc Symbols, Emoticons, Dingbats, etc.
    (cp >= 0x2600 && cp <= 0x26ff) || // Misc Symbols
    (cp >= 0x2700 && cp <= 0x27bf) || // Dingbats
    (cp >= 0x1fa00 && cp <= 0x1fa9f) || // Supplemental Symbols
    (cp >= 0x1fa70 && cp <= 0x1faff) || // Symbols Extended-A
    cp === 0x200d || // ZWJ
    cp === 0xfe0f // Variation selector
  );
}

/** 提取所有 emoji（逐码点扫描，兼容低版本 TS target） */
function extractEmojis(text: string): string[] {
  const result: string[] = [];
  const chars = Array.from(text); // 正确拆分 surrogate pairs
  let i = 0;
  while (i < chars.length) {
    const cp = chars[i].codePointAt(0) ?? 0;
    if (isEmojiCodePoint(cp)) {
      let emoji = chars[i];
      i++;
      // 吸收后续 ZWJ 序列和 variation selectors
      while (i < chars.length) {
        const nextCp = chars[i].codePointAt(0) ?? 0;
        if (isEmojiCodePoint(nextCp)) {
          emoji += chars[i];
          i++;
        } else {
          break;
        }
      }
      // 过滤掉纯 ZWJ/variation selector
      if (emoji.length > 0 && !/^[\u200d\ufe0f]+$/.test(emoji)) {
        result.push(emoji);
      }
    } else {
      i++;
    }
  }
  return result;
}

/** 句尾字符归类 */
function sentenceEndingPattern(sentence: string): string {
  const trimmed = sentence.replace(/\s+$/, "");
  if (!trimmed) return "other";
  const last = trimmed[trimmed.length - 1];
  if (last === "。") return "。";
  if (last === "！" || last === "!") return "！";
  if (last === "？" || last === "?") return "？";
  if (last === "～" || last === "~") return "～";
  if (last === "…" || trimmed.endsWith("...")) return "…";
  // emoji 结尾（码点检测）
  const lastCp = last.codePointAt(0) ?? 0;
  if (isEmojiCodePoint(lastCp)) return "emoji";
  if (last === "\n") return "换行";
  return "other";
}

/** 统计段落数（按连续换行拆分） */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** 字符级长度（去空白） */
function charLen(text: string): number {
  return text.replace(/\s/g, "").length;
}

/* ────────── 公开类型 ────────── */

export type StyleFingerprint = {
  /** 平均句子字数 */
  avgSentenceLen: number;
  /** 最短句 / 最长句字数 */
  minSentenceLen: number;
  maxSentenceLen: number;
  /** 平均段落数（每篇笔记） */
  avgParagraphCount: number;
  /** 句尾分布 top 模式 */
  endingDistribution: { pattern: string; pct: number }[];
  /** 高频 emoji（按出现频率降序，最多 10 个） */
  topEmojis: { emoji: string; count: number }[];
  /** emoji 密度：每百字 emoji 数 */
  emojiPer100Chars: number;
  /** 是否常用第一人称（我/咱/俺/本人/姐/哥）*/
  firstPersonFrequent: boolean;
  /** 是否含问句（？）占比 > 15% */
  frequentQuestions: boolean;
  /** 口语化指标（语气词密度）：啊/呀/吧/嘛/呢/哈/嗯/哦/噢/嘿/诶/哇/呜/嘞/咯/喽 每百字 */
  colloquialPer100Chars: number;
  /** 常见口头禅 / 高频短语（2-6字，≥2次） */
  recurringPhrases: string[];
  /** 标题平均字数 */
  avgTitleLen: number;
  /** 标题含 emoji 比例 */
  titleEmojiRate: number;
};

/* ────────── 主函数 ────────── */

export function extractStyleFingerprint(notes: NoteInput[]): StyleFingerprint | null {
  if (notes.length === 0) return null;

  const allBodies = notes.map((n) => n.body);
  const allTitles = notes.map((n) => n.title);
  const fullText = allBodies.join("\n");
  const totalChars = charLen(fullText);
  if (totalChars === 0) return null;

  // ── 句子分析 ──
  const allSentences = allBodies.flatMap(splitSentences);
  const sentenceLens = allSentences.map(charLen).filter((l) => l > 0);
  const avgSentenceLen = sentenceLens.length
    ? Math.round(sentenceLens.reduce((a, b) => a + b, 0) / sentenceLens.length)
    : 0;
  const minSentenceLen = sentenceLens.length ? Math.min(...sentenceLens) : 0;
  const maxSentenceLen = sentenceLens.length ? Math.max(...sentenceLens) : 0;

  // ── 段落分析 ──
  const paragraphCounts = allBodies.map((b) => splitParagraphs(b).length);
  const avgParagraphCount = paragraphCounts.length
    ? Math.round(
        (paragraphCounts.reduce((a, b) => a + b, 0) / paragraphCounts.length) * 10
      ) / 10
    : 0;

  // ── 句尾分布 ──
  const endMap = new Map<string, number>();
  for (const s of allSentences) {
    const p = sentenceEndingPattern(s);
    endMap.set(p, (endMap.get(p) ?? 0) + 1);
  }
  const totalEndings = allSentences.length || 1;
  const endingDistribution = [...endMap.entries()]
    .map(([pattern, count]) => ({ pattern, pct: Math.round((count / totalEndings) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  // ── Emoji 分析 ──
  const allEmojis = extractEmojis(fullText);
  const emojiFreq = new Map<string, number>();
  for (const e of allEmojis) emojiFreq.set(e, (emojiFreq.get(e) ?? 0) + 1);
  const topEmojis = [...emojiFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({ emoji, count }));
  const emojiPer100Chars = Math.round((allEmojis.length / totalChars) * 100 * 10) / 10;

  // ── 第一人称 ──
  const firstPersonRe = /我|咱|俺|本人|姐(?![妹夫弟])|哥(?![们哥弟])/g;
  const fpCount = (fullText.match(firstPersonRe) ?? []).length;
  const firstPersonFrequent = fpCount / (totalChars / 100) > 1.5;

  // ── 问句比例 ──
  const questionCount = allSentences.filter(
    (s) => s.includes("？") || s.includes("?")
  ).length;
  const frequentQuestions = questionCount / totalEndings > 0.15;

  // ── 口语化指标 ──
  const colloquialRe = /[啊呀吧嘛呢哈嗯哦噢嘿诶哇呜嘞咯喽]/g;
  const colloquialCount = (fullText.match(colloquialRe) ?? []).length;
  const colloquialPer100Chars = Math.round((colloquialCount / totalChars) * 100 * 10) / 10;

  // ── 高频短语 ──
  const recurringPhrases = findRecurringPhrases(allBodies);

  // ── 标题分析 ──
  const titleLens = allTitles.map(charLen).filter((l) => l > 0);
  const avgTitleLen = titleLens.length
    ? Math.round(titleLens.reduce((a, b) => a + b, 0) / titleLens.length)
    : 0;
  const titlesWithEmoji = allTitles.filter(
    (t) => extractEmojis(t).length > 0
  ).length;
  const titleEmojiRate = allTitles.length
    ? Math.round((titlesWithEmoji / allTitles.length) * 100)
    : 0;

  return {
    avgSentenceLen,
    minSentenceLen,
    maxSentenceLen,
    avgParagraphCount,
    endingDistribution,
    topEmojis,
    emojiPer100Chars,
    firstPersonFrequent,
    frequentQuestions,
    colloquialPer100Chars,
    recurringPhrases,
    avgTitleLen,
    titleEmojiRate,
  };
}

/* ────────── 高频短语提取（简单 n-gram） ────────── */

function findRecurringPhrases(bodies: string[]): string[] {
  const ngramCounts = new Map<string, number>();
  const fullClean = bodies.join(" ").replace(/\s+/g, "");

  // 提取 2~6 字 n-gram
  for (let n = 2; n <= 6; n++) {
    for (let i = 0; i <= fullClean.length - n; i++) {
      const gram = fullClean.slice(i, i + n);
      // 跳过纯标点 / 纯符号
      if (/^[^\u4e00-\u9fff\w]+$/.test(gram)) continue;
      ngramCounts.set(gram, (ngramCounts.get(gram) ?? 0) + 1);
    }
  }

  // 筛选 ≥ 2 次且不是常用停用词
  const stopwords = new Set([
    "的时候", "的那个", "一个", "什么", "这个", "那个", "就是", "可以",
    "不是", "没有", "他们", "我们", "自己", "已经", "因为", "所以",
    "但是", "而且", "如果", "虽然", "还是", "或者", "这样", "那样",
    "然后", "之后", "不过", "知道", "觉得", "感觉", "真的", "其实",
  ]);

  const candidates = [...ngramCounts.entries()]
    .filter(([gram, count]) => count >= 2 && !stopwords.has(gram))
    .sort((a, b) => {
      // 优先更长短语，再按频率
      const lenDiff = b[0].length - a[0].length;
      if (lenDiff !== 0) return lenDiff;
      return b[1] - a[1];
    });

  // 去重：如果短的 gram 完全被更长的 gram 包含且频率相近，则去掉短的
  const result: string[] = [];
  for (const [gram] of candidates) {
    if (result.length >= 8) break;
    const isSubOf = result.some((r) => r.includes(gram));
    if (!isSubOf) result.push(gram);
  }

  return result;
}

/* ────────── 格式化为可读文本（注入 prompt） ────────── */

export function formatStyleFingerprint(fp: StyleFingerprint): string {
  const lines: string[] = [];

  lines.push(`句式节奏：句子平均 ${fp.avgSentenceLen} 字，最短 ${fp.minSentenceLen} 字，最长 ${fp.maxSentenceLen} 字。每篇约 ${fp.avgParagraphCount} 段。`);

  if (fp.endingDistribution.length > 0) {
    const endDesc = fp.endingDistribution
      .filter((e) => e.pct >= 5)
      .map((e) => `${e.pattern}(${e.pct}%)`)
      .join("、");
    lines.push(`句尾习惯：${endDesc}`);
  }

  if (fp.topEmojis.length > 0) {
    const emojiList = fp.topEmojis.slice(0, 6).map((e) => e.emoji).join("");
    lines.push(
      `Emoji 风格：每百字约 ${fp.emojiPer100Chars} 个 emoji。常用：${emojiList}`
    );
  } else {
    lines.push(`Emoji 风格：几乎不用 emoji。`);
  }

  lines.push(
    `口语化程度：语气词密度 ${fp.colloquialPer100Chars}/百字` +
      (fp.colloquialPer100Chars > 3
        ? "（偏口语、聊天感强）"
        : fp.colloquialPer100Chars > 1
          ? "（适度口语）"
          : "（偏书面/干练）") +
      `。${fp.firstPersonFrequent ? "频繁使用第一人称。" : "较少使用第一人称。"}` +
      `${fp.frequentQuestions ? "爱用问句引导读者。" : ""}`
  );

  if (fp.recurringPhrases.length > 0) {
    lines.push(`高频表达/口头禅：「${fp.recurringPhrases.join("」「")}」`);
  }

  lines.push(
    `标题风格：平均 ${fp.avgTitleLen} 字` +
      (fp.titleEmojiRate > 50
        ? "，标题常带 emoji"
        : fp.titleEmojiRate > 0
          ? "，标题偶尔带 emoji"
          : "，标题不带 emoji") +
      "。"
  );

  return lines.join("\n");
}

/* ────────── 笔记摘录（取前 N 句作为风格片段，不暴露完整内容） ────────── */

export function excerptNote(body: string, maxSentences = 3): string {
  const sentences = splitSentences(body);
  if (sentences.length <= maxSentences) return body;
  return sentences.slice(0, maxSentences).join("") + "……";
}
