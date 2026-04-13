import type { RetrievalMode } from "@/lib/persona-rag/retrieve-threshold";

export type RawNote = { title: string; body: string };

/** DNA 模式下单条笔记的压缩表示 */
export type DigestedNote = {
  index: number;
  title: string;
  /** 常用 emoji 列表（去重，保留原字符） */
  emojiList: string[];
  /** 从笔记里选出的 2-3 句完整原句（保留语感，按句边界切） */
  sampleSentences: string[];
};

function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  const t = normalizeText(text);
  if (!t) return [];
  return t
    .split(/[。！？\n]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function isEmojiCode(code: number): boolean {
  return (
    (code >= 0x1f300 && code <= 0x1faf6) ||
    (code >= 0x2600 && code <= 0x27bf) ||
    (code >= 0x1f600 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff)
  );
}

function extractEmojis(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const cp = body.codePointAt(i);
    if (cp === undefined) continue;
    if (cp > 0xffff) i++;
    if (!isEmojiCode(cp)) continue;
    const ch = String.fromCodePoint(cp);
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out.slice(0, 12);
}

/**
 * 从笔记正文里选 2-3 句**完整的、保留语感**的句子。
 * 策略：前、中、后各取一句（有就取），每句 cap 80 字。
 */
function pickSampleSentences(body: string, mode: RetrievalMode): string[] {
  const sents = splitSentences(body).filter((s) => s.length >= 4);
  if (sents.length === 0) return [];

  const cap = mode === "style_only" ? 60 : 80;
  const clip = (s: string) => (s.length > cap ? `${s.slice(0, cap)}…` : s);

  if (sents.length === 1) return [clip(sents[0])];
  if (sents.length === 2) return [clip(sents[0]), clip(sents[1])];

  const count = mode === "topic_aligned" ? 3 : 2;
  const idxs =
    count === 3
      ? [0, Math.floor(sents.length / 2), sents.length - 1]
      : [0, sents.length - 1];
  return idxs.map((i) => clip(sents[i]));
}

/**
 * 按向量检索划分的模式生成「DNA」摘要（非全文）。
 */
export function digestNotesForDna(
  notes: RawNote[],
  retrievalMode: RetrievalMode
): DigestedNote[] {
  if (notes.length === 0) return [];
  return notes.map((n, i) => ({
    index: i + 1,
    title: normalizeText(n.title) || `笔记 ${i + 1}`,
    emojiList: extractEmojis(n.body ?? ""),
    sampleSentences: pickSampleSentences(n.body ?? "", retrievalMode),
  }));
}
