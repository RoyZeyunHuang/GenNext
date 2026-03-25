import dict from "@/data/xhs-forbidden-words.json";

export type RiskLevel = "high" | "medium" | "low";

export type ForbiddenEntry = {
  phrase: string;
  level: RiskLevel;
  source: string;
};

type DictFile = {
  version: number;
  entries: ForbiddenEntry[];
};

const RANK: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1 };

let sortedEntries: ForbiddenEntry[] | null = null;

function getSortedEntries(): ForbiddenEntry[] {
  if (!sortedEntries) {
    sortedEntries = [...(dict as DictFile).entries].sort(
      (a, b) => b.phrase.length - a.phrase.length
    );
  }
  return sortedEntries;
}

export type ForbiddenHit = {
  start: number;
  end: number;
  phrase: string;
  level: RiskLevel;
};

export type ScanResult = {
  hits: ForbiddenHit[];
  /** 与 text 等长，逐字最高风险等级（用于着色） */
  levelAt: (RiskLevel | null)[];
};

/** 文本命中小红书违禁词库（总表 + 房产专项）；重叠区间按较高风险着色 */
export function scanXhsForbidden(text: string): ScanResult {
  const entries = getSortedEntries();
  const n = text.length;
  const levelAt: (RiskLevel | null)[] = Array.from({ length: n }, () => null);
  const hits: ForbiddenHit[] = [];

  for (const { phrase, level } of entries) {
    if (!phrase) continue;
    let from = 0;
    while (from <= n - phrase.length) {
      const idx = text.indexOf(phrase, from);
      if (idx === -1) break;
      const end = idx + phrase.length;
      hits.push({ start: idx, end, phrase, level });
      for (let i = idx; i < end; i++) {
        const cur = levelAt[i];
        if (!cur || RANK[level] > RANK[cur]) {
          levelAt[i] = level;
        }
      }
      from = idx + 1;
    }
  }

  const uniq = new Map<string, ForbiddenHit>();
  for (const h of hits) {
    const k = `${h.start}:${h.end}:${h.phrase}`;
    if (!uniq.has(k)) uniq.set(k, h);
  }
  const hitList = Array.from(uniq.values()).sort(
    (a, b) => a.start - b.start || b.end - a.end
  );

  return { hits: hitList, levelAt };
}

export function segmentsForHighlight(
  text: string,
  levelAt: (RiskLevel | null)[]
): Array<{ start: number; end: number; level: RiskLevel | null }> {
  if (!text.length) return [];
  const segments: Array<{ start: number; end: number; level: RiskLevel | null }> = [];
  let start = 0;
  let current = levelAt[0] ?? null;
  for (let i = 1; i <= text.length; i++) {
    const lev = i < text.length ? levelAt[i] ?? null : null;
    if (i === text.length || lev !== current) {
      segments.push({ start, end: i, level: current });
      start = i;
      current = lev;
    }
  }
  return segments;
}

export function riskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return level;
  }
}

export function riskLevelMarkClass(level: RiskLevel): string {
  switch (level) {
    case "high":
      return "bg-red-200/95 text-red-950";
    case "medium":
      return "bg-amber-200/95 text-amber-950";
    case "low":
      return "bg-yellow-100 text-yellow-950";
    default:
      return "bg-stone-200 text-stone-900";
  }
}

export function riskLevelBadgeClass(level: RiskLevel): string {
  switch (level) {
    case "high":
      return "bg-red-100 text-red-800 border-red-200";
    case "medium":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "low":
      return "bg-yellow-50 text-yellow-900 border-yellow-200";
    default:
      return "bg-stone-100 text-stone-800 border-stone-200";
  }
}
