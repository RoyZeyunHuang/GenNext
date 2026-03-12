"use client";

import { useState, useMemo } from "react";
import { Download } from "lucide-react";

type Dimension = { key: string; label: string; desc: string; score: number; notes: string };

const DIMS: Omit<Dimension, "score" | "notes">[] = [
  { key: "cat2", label: "AI System Builder", desc: "只是用 AI，还是在建公司级 AI 体系？" },
  { key: "cat3", label: "Internal AI Training & Leverage", desc: "是否在放大团队能力？" },
  { key: "cat4", label: "China Team Optimization", desc: "远程资源是否管理高效？" },
  { key: "cat5", label: "Strategic Marketing & Client Leadership", desc: "能否独立负责完整案子？" },
];

function getZone(s: number): { label: string; color: string } {
  if (s <= 10) return { label: "Eliminate Zone", color: "#ff4b4b" };
  if (s <= 18) return { label: "Mid", color: "#e6b422" };
  return { label: "Keep Level", color: "#21c354" };
}

function getDecision(total: number): { label: string; color: string; emoji: string } {
  if (total >= 85) return { label: "Keep — Senior Potential", color: "#21c354", emoji: "🟢" };
  if (total >= 75) return { label: "Keep — Monitor Month 2", color: "#4a90d9", emoji: "🔵" };
  if (total >= 60) return { label: "Replaceable", color: "#e6b422", emoji: "🟡" };
  return { label: "Eliminate", color: "#ff4b4b", emoji: "🔴" };
}

export function KpiAiTab() {
  const [aeName, setAeName] = useState("");
  const [month, setMonth] = useState("");
  const [dims, setDims] = useState<Record<string, { score: number; notes: string }>>(
    Object.fromEntries(DIMS.map((d) => [d.key, { score: 12, notes: "" }]))
  );

  const total = useMemo(() => Object.values(dims).reduce((s, d) => s + d.score, 0), [dims]);
  const decision = useMemo(() => getDecision(total), [total]);

  const exportCsv = () => {
    const header = "AE,评估月,Cat2 Score,Cat3 Score,Cat4 Score,Cat5 Score,总分,决策,Cat2 备注,Cat3 备注,Cat4 备注,Cat5 备注";
    const row = [
      aeName, month,
      dims.cat2.score, dims.cat3.score, dims.cat4.score, dims.cat5.score,
      total, `${decision.emoji} ${decision.label}`,
      `"${dims.cat2.notes.replace(/"/g, '""')}"`,
      `"${dims.cat3.notes.replace(/"/g, '""')}"`,
      `"${dims.cat4.notes.replace(/"/g, '""')}"`,
      `"${dims.cat5.notes.replace(/"/g, '""')}"`,
    ].join(",");
    const blob = new Blob(["\ufeff" + header + "\n" + row], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kpi-ai-${aeName || "eval"}-${month || "unknown"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls = "h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input value={aeName} onChange={(e) => setAeName(e.target.value)} placeholder="AE 姓名" className={`${inputCls} w-48`} />
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-4">
        {DIMS.map((d) => {
          const val = dims[d.key];
          const zone = getZone(val.score);
          return (
            <div key={d.key} className="rounded-lg bg-white p-5 shadow-card">
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#1C1917]">{d.label}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold" style={{ color: zone.color }}>{val.score}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: zone.color }}>{zone.label}</span>
                </div>
              </div>
              <p className="mb-3 text-xs text-[#A8A29E]">{d.desc}</p>
              <input
                type="range" min={0} max={25} value={val.score}
                onChange={(e) => setDims((prev) => ({ ...prev, [d.key]: { ...prev[d.key], score: parseInt(e.target.value) } }))}
                className="mb-2 w-full accent-[#1C1917]"
              />
              <div className="flex justify-between text-[10px] text-[#A8A29E]">
                <span>0</span><span>10</span><span>18</span><span>25</span>
              </div>
              <textarea
                value={val.notes}
                onChange={(e) => setDims((prev) => ({ ...prev, [d.key]: { ...prev[d.key], notes: e.target.value } }))}
                placeholder="评分依据..."
                rows={2}
                className="mt-3 w-full resize-none rounded-lg border border-[#E7E5E4] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
              />
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-white p-6 shadow-card">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-sm text-[#78716C]">总分</div>
            <div className="mt-1 text-3xl font-bold text-[#1C1917]">{total} <span className="text-base font-normal text-[#78716C]">/ 100</span></div>
          </div>
          <div className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: decision.color }}>
            {decision.emoji} {decision.label}
          </div>
        </div>
        <div className="grid gap-3">
          {DIMS.map((d) => {
            const val = dims[d.key];
            const zone = getZone(val.score);
            return (
              <div key={d.key} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-[#78716C]">{d.key.toUpperCase()}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#F5F5F4]">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(val.score / 25) * 100}%`, backgroundColor: zone.color }} />
                </div>
                <span className="w-8 text-right text-xs font-medium tabular-nums text-[#1C1917]">{val.score}</span>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={exportCsv} className="mt-5 flex h-9 items-center gap-1 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90">
          <Download className="h-3.5 w-3.5" /> 导出 CSV
        </button>
      </div>
    </div>
  );
}
