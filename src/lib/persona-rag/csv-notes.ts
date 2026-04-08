/** 解析含引号字段的单行 CSV（逗号分隔）。 */
function parseCsvRowLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      result.push(field.trim());
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  result.push(field.trim());
  return result;
}

export type ParsedPersonaNoteRow = {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
};

export function parsePersonaNotesCsv(csvText: string): ParsedPersonaNoteRow[] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvRowLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());
  const titleIdx = header.indexOf("笔记标题");
  const bodyIdx = header.indexOf("笔记文案");
  const likesIdx = (() => {
    const i = header.indexOf("点赞数");
    if (i >= 0) return i;
    return header.indexOf("点赞");
  })();
  const dateIdx = header.indexOf("发布时间");
  const nicknameIdx = (() => {
    const i = header.indexOf("昵称");
    if (i >= 0) return i;
    return header.indexOf("作者昵称");
  })();

  if (titleIdx < 0 || bodyIdx < 0) {
    throw new Error('CSV 表头需包含「笔记标题」「笔记文案」列');
  }

  const rows: ParsedPersonaNoteRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvRowLine(lines[r]);
    const title = (cells[titleIdx] ?? "").trim();
    const body = (cells[bodyIdx] ?? "").trim();
    if (!title && !body) continue;

    if (!title || !body) {
      throw new Error(
        `第 ${r + 1} 行：笔记标题与笔记文案均为必填，请补全后重试（当前：标题${title ? "已填" : "为空"}，文案${body ? "已填" : "为空"}）`
      );
    }

    const metadata: Record<string, unknown> = {};
    if (likesIdx >= 0 && cells[likesIdx] != null && cells[likesIdx] !== "") {
      const n = Number(String(cells[likesIdx]).replace(/,/g, ""));
      if (!Number.isNaN(n)) metadata.likes = n;
      else metadata.likes_raw = cells[likesIdx];
    }
    if (dateIdx >= 0 && cells[dateIdx]) metadata.published_at = cells[dateIdx];
    if (nicknameIdx >= 0 && cells[nicknameIdx] != null) {
      const nick = String(cells[nicknameIdx]).trim();
      if (nick) metadata.nickname = nick;
    }

    rows.push({ title, body, metadata });
  }
  return rows;
}
