"use client";

import { CopyButton } from "./CopyButton";
import { SendToCopywriterButton } from "./SendToCopywriterButton";
import type { Building } from "@/lib/apartments/types";

interface Metric {
  buildingId: string;
  minPrice: number | null;
  minEff: number | null;
  maxConcession: number;
  commuteMinutes: number | null;
  commuteLines: string[];
  available: number;
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

function fmtLine(line: string): string {
  return /^[A-Z]+$/.test(line) ? `${line}线` : line;
}

export function CompareCopyButton({
  buildings,
  metrics,
  schoolShort,
}: {
  buildings: Building[];
  metrics: Metric[];
  schoolShort: string;
}) {
  // Build a Chinese WeChat-ready compare snippet.
  const lines: string[] = [];
  lines.push(`📊 ${buildings.length} 栋楼对比 (以 ${schoolShort} 通勤为参考)`);
  lines.push("");

  for (const b of buildings) {
    const m = metrics.find((x) => x.buildingId === b.id);
    lines.push(`▸ ${b.name} · ${b.address ?? ""}`);
    lines.push(`  ${b.year_built ?? "?"}年 · ${b.floor_count ?? "?"}F · ${m?.available ?? 0} 套在租`);
    if (m?.minPrice) {
      const price = fmtPrice(m.minPrice);
      const eff = m.minEff && m.minEff !== m.minPrice ? ` (有效 ${fmtPrice(m.minEff)})` : "";
      lines.push(`  💰 起价 ${price}${eff}`);
    }
    if (m?.maxConcession && m.maxConcession > 0) {
      lines.push(`  🎁 最多 ${m.maxConcession} 个月免租`);
    }
    if (m?.commuteMinutes != null) {
      const linesStr = m.commuteLines.length ? `(${m.commuteLines.map(fmtLine).join("→")})` : "";
      lines.push(`  🚇 ${schoolShort} ${m.commuteMinutes}min ${linesStr}`);
    }
    lines.push(`  🔗 ${b.building_url}`);
    lines.push("");
  }

  const text = lines.join("\n").trimEnd();
  return (
    <div className="flex items-center gap-1">
      <CopyButton
        text={text}
        label="📋 复制对比"
        copiedLabel="✓ 已复制"
        size="sm"
      />
      <SendToCopywriterButton content={text} />
    </div>
  );
}
