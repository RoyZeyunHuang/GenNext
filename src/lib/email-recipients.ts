/** 按逗号/分号拆分、去重（大小写不敏感）、拼接为 RFC 822 地址列表 */

function splitAndDedupe(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw.split(/[,;]+/)) {
    const t = p.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * 合并用户输入与环境变量默认抄送（如 DEFAULT_CC_EMAIL），去重。
 */
export function mergeRecipientList(
  user: string | undefined | null,
  envDefault: string | undefined
): string | undefined {
  const merged = [...splitAndDedupe(user), ...splitAndDedupe(envDefault)];
  if (merged.length === 0) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of merged) {
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out.join(", ");
}
