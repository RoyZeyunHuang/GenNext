"use client";

import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { BuildingSnapshotRow } from "@/lib/apartments/snapshots";

interface Props {
  snapshots: BuildingSnapshotRow[];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function TrendSparklines({ snapshots }: Props) {
  // Pre-compute the data series we'll plot
  const data = useMemo(() => {
    return snapshots.map((s) => {
      const med = s.median_price_by_beds ?? {};
      return {
        date: s.snapshot_date,
        label: formatDate(s.snapshot_date),
        active: s.active_count ?? 0,
        studio: med["0"] ?? null,
        oneBR: med["1"] ?? null,
        twoBR: med["2"] ?? null,
      };
    });
  }, [snapshots]);

  if (data.length < 2) {
    return (
      <p className="text-xs text-muted-foreground italic">
        至少需要 2 天的数据快照才能展示趋势,请明天再来。
      </p>
    );
  }

  const hasStudio = data.some((d) => d.studio != null);
  const hasOneBR = data.some((d) => d.oneBR != null);
  const hasTwoBR = data.some((d) => d.twoBR != null);

  const last = data[data.length - 1];
  const first = data[0];
  const activeChange = last.active - first.active;

  return (
    <div className="space-y-4">
      {/* Active count trend */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground">在租房源数</h4>
          <span className="text-xs">
            {first.active} → <strong>{last.active}</strong>
            {activeChange !== 0 && (
              <span className={activeChange > 0 ? "ml-1 text-green-700" : "ml-1 text-rose-700"}>
                ({activeChange > 0 ? "+" : ""}{activeChange})
              </span>
            )}
          </span>
        </div>
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} width={24} axisLine={false} tickLine={false} />
              <Tooltip wrapperClassName="!text-xs" />
              <Line type="monotone" dataKey="active" stroke="#0070f3" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Median price by bed count */}
      {(hasStudio || hasOneBR || hasTwoBR) && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground">中位租金</h4>
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              {hasStudio && <span><span style={{ color: "#0070f3" }}>●</span> 开间</span>}
              {hasOneBR && <span><span style={{ color: "#10b981" }}>●</span> 1卧</span>}
              {hasTwoBR && <span><span style={{ color: "#f59e0b" }}>●</span> 2卧</span>}
            </div>
          </div>
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} width={32} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip wrapperClassName="!text-xs"
                  formatter={(v) => `$${Number(v).toLocaleString()}`} />
                {hasStudio && <Line type="monotone" dataKey="studio" stroke="#0070f3" strokeWidth={2} dot={false} connectNulls />}
                {hasOneBR && <Line type="monotone" dataKey="oneBR" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />}
                {hasTwoBR && <Line type="monotone" dataKey="twoBR" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
