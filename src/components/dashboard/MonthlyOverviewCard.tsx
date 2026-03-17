"use client";

import { useEffect, useState } from "react";

type PaidKpi = {
  kpi?: {
    distinct_notes?: number;
    total_impressions?: number;
    total_interactions?: number;
    total_spend?: number;
  };
};

function formatShortNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_0000_0000) return (value / 1_0000_0000).toFixed(1).replace(/\.0$/, "") + "亿";
  if (value >= 1_0000) return (value / 1_0000).toFixed(1).replace(/\.0$/, "") + "万";
  return value.toLocaleString();
}

export function MonthlyOverviewCard() {
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState<PaidKpi | null>(null);

  useEffect(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = first.toISOString().slice(0, 10);

    const fetchData = async () => {
      setLoading(true);
      try {
        const paidRes = await fetch(
          `/api/kpi/paid-stats?from_date=${monthStartStr}&to_date=${todayStr}`,
          { cache: "no-store" }
        );
        const paidData = await paidRes.json().catch(() => ({}));
        setPaid(paidData);
      } catch {
        setPaid(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const distinctNotes = paid?.kpi?.distinct_notes ?? 0;
  const totalImpressions = paid?.kpi?.total_impressions ?? 0;
  const totalInteractions = paid?.kpi?.total_interactions ?? 0;
  const totalSpend = paid?.kpi?.total_spend ?? 0;

  const hasData = distinctNotes > 0 || totalImpressions > 0 || totalInteractions > 0 || totalSpend > 0;

  return (
    <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-medium text-[#1C1917]">📊 本月投广 KPI</h3>
      {loading ? (
        <p className="text-xs text-[#78716C]">加载中…</p>
      ) : !hasData ? (
        <a href="/kpi" className="text-xs text-blue-600 hover:underline">
          暂无本月投广数据，上传数据 →
        </a>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">笔记篇数</div>
            <div className="text-xl font-bold text-[#1C1917]">{distinctNotes.toLocaleString()}</div>
            <div className="text-xs text-gray-400">篇</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">本月展现</div>
            <div className="text-xl font-bold text-[#1C1917]">{formatShortNumber(totalImpressions)}</div>
            <div className="text-xs text-gray-400">次</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">本月互动</div>
            <div className="text-xl font-bold text-[#1C1917]">{totalInteractions.toLocaleString()}</div>
            <div className="text-xs text-gray-400">次</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">本月消费</div>
            <div className="text-xl font-bold text-[#1C1917]">
              ¥{totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-gray-400">&nbsp;</div>
          </div>
        </div>
      )}
    </div>
  );
}

