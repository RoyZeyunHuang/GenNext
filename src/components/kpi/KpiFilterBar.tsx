"use client";

import { useState, useEffect } from "react";

type Props = {
  from: string; to: string; ae: string; building: string;
  onChange: (f: { from: string; to: string; ae: string; building: string }) => void;
  showAeBuilding?: boolean;
};

export function KpiFilterBar({ from, to, ae, building, onChange, showAeBuilding = true }: Props) {
  const [aeList, setAeList] = useState<string[]>([]);
  const [buildingList, setBuildingList] = useState<string[]>([]);

  useEffect(() => {
    if (!showAeBuilding) return;
    fetch("/api/kpi/ae-list").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setAeList(d); });
    fetch("/api/kpi/building-list").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setBuildingList(d); });
  }, [showAeBuilding]);

  const cls = "h-9 rounded-lg border border-[#E7E5E4] bg-white px-3 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20";

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to, ae, building })} className={cls} />
      <span className="text-sm text-[#A8A29E]">→</span>
      <input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value, ae, building })} className={cls} />
      {showAeBuilding && (
        <>
          <select value={ae} onChange={(e) => onChange({ from, to, ae: e.target.value, building })} className={cls}>
            <option value="">All AE</option>
            {aeList.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={building} onChange={(e) => onChange({ from, to, ae, building: e.target.value })} className={cls}>
            <option value="">All Building</option>
            {buildingList.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </>
      )}
    </div>
  );
}
