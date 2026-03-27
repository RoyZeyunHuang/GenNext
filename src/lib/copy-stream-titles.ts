/** 正文流末尾附带的标题 JSON 标记（与 /api/ai/generate body 流一致） */
export const GNN_TITLES_MARKER = "\n<<<GNN_TITLES>>>\n";

export type StreamedTitleItem = { type_name: string; text: string };

export function splitBodyAndStreamTitles(raw: string): {
  body: string;
  titles: StreamedTitleItem[] | null;
} {
  const i = raw.indexOf(GNN_TITLES_MARKER);
  if (i === -1) return { body: raw, titles: null };
  const body = raw.slice(0, i);
  const rest = raw.slice(i + GNN_TITLES_MARKER.length).trim();
  try {
    const parsed = JSON.parse(rest) as { titles?: StreamedTitleItem[] };
    const titles = Array.isArray(parsed.titles) ? parsed.titles : null;
    return { body, titles };
  } catch {
    return { body: raw, titles: null };
  }
}
