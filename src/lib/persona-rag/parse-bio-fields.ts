/**
 * 从 persona bio_md 中提取结构化字段。
 * bio_md 格式约定：每个字段以 **字段名**：值 或 字段名：值 开头。
 */

export type PersonaBioFields = {
  name: string | null;
  age: string | null;
  gender: string | null;
  location: string | null;
  career: string | null;
  story: string | null;
};

/** 尝试匹配 **姓名**：xxx 或 姓名：xxx 格式，取冒号后的内容直到换行 */
function extractField(text: string, labels: string[]): string | null {
  for (const label of labels) {
    // Match **label**：value or label：value (with optional bold markers)
    const re = new RegExp(
      `(?:^|\\n)\\s*(?:\\*{0,2})${label}(?:\\*{0,2})\\s*[：:]\\s*(.+?)(?:\\n|$)`,
      "m"
    );
    const m = text.match(re);
    if (m?.[1]) {
      return m[1].trim().replace(/\*+/g, "");
    }
  }
  return null;
}

/** 提取生活小传段落（从标记行到下一个 ## 或文件结尾） */
function extractStory(text: string): string | null {
  const markers = ["虚拟人生活小传", "生活小传"];
  for (const marker of markers) {
    const re = new RegExp(
      `(?:^|\\n)\\s*(?:\\*{0,2})${marker}(?:\\*{0,2})\\s*[：:]?\\s*\\n([\\s\\S]*?)(?:\\n(?:#{1,3}\\s|\\*{2}说话|说话方式)|$)`,
      "m"
    );
    const m = text.match(re);
    if (m?.[1]?.trim()) {
      return m[1].trim();
    }
  }
  return null;
}

export function parseBioFields(bioMd: string): PersonaBioFields {
  if (!bioMd?.trim()) {
    return { name: null, age: null, gender: null, location: null, career: null, story: null };
  }

  const name = extractField(bioMd, ["姓名"]);
  const age = extractField(bioMd, ["年龄"]);
  const gender = extractField(bioMd, ["性别"]);
  const location = extractField(bioMd, ["地域", "地区", "坐标", "城市"]);

  // Career field: try multiple label patterns
  let career = extractField(bioMd, ["职业 / 学校背景", "职业/学校背景", "职业背景", "学校背景", "职业"]);

  // Career is often multi-line; if the single-line extract is short, grab more
  if (career && career.length < 20) {
    // Try to get the full paragraph
    const careerMarkers = ["职业 / 学校背景", "职业/学校背景", "职业背景"];
    for (const marker of careerMarkers) {
      const re = new RegExp(
        `(?:^|\\n)\\s*(?:\\*{0,2})${marker}(?:\\*{0,2})\\s*[：:]?\\s*\\n([\\s\\S]*?)(?:\\n(?:#{1,3}\\s|\\*{2}虚拟人|虚拟人生活小传)|$)`,
        "m"
      );
      const m = bioMd.match(re);
      if (m?.[1]?.trim()) {
        career = m[1].trim();
        break;
      }
    }
  }

  const story = extractStory(bioMd);

  return { name, age, gender, location, career, story };
}

/** 从 career 字段中提取一个简短的身份标签（如"创始人""研究生"） */
export function shortCareerLabel(career: string | null): string {
  if (!career) return "—";
  // Take first line only
  let s = career.split(/\n/)[0]?.trim() ?? "";
  // Remove parenthetical content
  s = s.replace(/[（(][^）)]*[）)]/g, "").trim();
  // Take before first Chinese comma or period
  s = s.split(/[，。；]/)[0]?.trim() ?? s;
  if (s.length <= 20) return s;
  return s.slice(0, 18) + "…";
}

/** 清理姓名字段：去掉括号里的标签 */
export function cleanName(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/[（(][^）)]*[）)]/g, "").trim();
}

/** 清理年龄字段：去掉括号里的推测/描述 */
export function cleanAge(raw: string | null): string {
  if (!raw) return "";
  // Strip parenthetical annotations like （推测：...） or （自述"..."）
  let s = raw.replace(/[（(][^）)]*[）)]/g, "").trim();
  // Remove trailing punctuation
  s = s.replace(/[，,；;。]+$/, "").trim();
  return s;
}

/** 截短地域字段：只保留核心地标 */
export function shortLocation(raw: string | null): string {
  if (!raw) return "";
  // Strip parenthetical details
  let s = raw.replace(/[（(][^）)]*[）)]/g, "").trim();
  // Cut at em-dash lists like "纽约全域——LIC、Manhattan..."
  s = s.split(/——/)[0]?.trim() ?? s;
  // Cut at Chinese comma / semicolon / period / enumeration comma (take first clause only)
  s = s.split(/[，；。、]/)[0]?.trim() ?? s;
  // Remove leading prefixes
  s = s.replace(/^(?:Base\s*在\s*|现居\s*|总部\s*)/i, "").trim();
  // Remove trailing modifiers like "为核心" "为主" "全域" "全域覆盖" etc.
  s = s.replace(/(?:为核心|为主|全域覆盖?|覆盖)$/, "").trim();
  if (s.length <= 20) return s;
  return s.slice(0, 18) + "…";
}

/** 从 story 中取前 N 个字作为摘要 */
export function storyExcerpt(story: string | null, maxLen = 120): string {
  if (!story) return "";
  const clean = story.replace(/\n+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + "…";
}
