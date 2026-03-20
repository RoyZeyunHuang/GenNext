/**
 * 解析 AI 输出的「成套标题」区块：以【类型名】开头的行，空行后为正文。
 * 若首行不符合该格式，视为无变体，全文作为正文。
 */
export function parseTitleVariantsAndBody(text: string): {
  variants: { label: string; text: string }[];
  body: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { variants: [], body: "" };

  const lines = trimmed.split(/\r?\n/);
  const variants: { label: string; text: string }[] = [];
  let i = 0;
  const re = /^【([^】]+)】\s*(.*)$/;

  while (i < lines.length) {
    const m = lines[i].match(re);
    if (m) {
      variants.push({ label: m[1].trim(), text: (m[2] || "").trim() });
      i++;
    } else if (variants.length > 0) {
      break;
    } else {
      return { variants: [], body: trimmed };
    }
  }

  while (i < lines.length && lines[i].trim() === "") i++;
  const body = lines.slice(i).join("\n").trim();
  return { variants, body };
}

/** 用于复制 / 收藏：选中的标题 + 正文 */
export function composeOutputWithTitle(selectedTitle: string, body: string): string {
  const t = selectedTitle.trim();
  const b = body.trim();
  if (!t && !b) return "";
  if (!t) return b;
  if (!b) return t;
  return `${t}\n\n${b}`;
}
