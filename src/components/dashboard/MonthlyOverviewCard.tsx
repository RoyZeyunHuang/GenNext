"use client";

import { useEffect, useState } from "react";

type NotesKpi = { kpi?: { total_notes?: number; total_exposure?: number } };
type PaidKpi = { kpi?: { total_spend?: number; total_dm_lead?: number } };

function formatShortNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_0000_0000) return (value / 1_0000_0000).toFixed(1).replace(/\.0$/, "") + "亿";
  if (value >= 1_0000) return (value / 1_0000).toFixed(1).replace(/\.0$/, "") + "万";
  return value.toLocaleString();
}

export function MonthlyOverviewCard() {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<NotesKpi | null>(null);
  const [paid, setPaid] = useState<PaidKpi | null>(null);

  useEffect(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = first.toISOString().slice(0, 10);

    const fetchData = async () => {
      setLoading(true);
      try {
        const [notesRes, paidRes] = await Promise.all([
          fetch(`/api/kpi/notes-stats?from_date=${monthStartStr}&to_date=${todayStr}`, { cache: "no-store" }),
          fetch(`/api/kpi/paid-stats?from_date=${monthStartStr}&to_date=${todayStr}`, { cache: "no-store" }),
        ]);
        const notesData = await notesRes.json().catch(() => ({}));
        const paidData = await paidRes.json().catch(() => ({}));
        setNotes(notesData);
        setPaid(paidData);
      } catch {
        setNotes(null);
        setPaid(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalNotes = notes?.kpi?.total_notes ?? 0;
  const totalExposure = notes?.kpi?.total_exposure ?? 0;
  const totalSpend = paid?.kpi?.total_spend ?? 0;
  const totalDmLead = paid?.kpi?.total_dm_lead ?? 0;

  const hasData = totalNotes > 0 || totalExposure > 0 || totalSpend > 0 || totalDmLead > 0;

  return (
    <div className="rounded-lg border border-[#E7E5E4] bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-medium text-[#1C1917]">📊 本月数据概览</h3>
      {loading ? (
        <p className="text-xs text-[#78716C]">加载中…</p>
      ) : !hasData ? (
        <a href="/kpi" className="text-xs text-blue-600 hover:underline">
          暂无本月数据，上传数据 →
        </a>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">本月发布</div>
            <div className="text-xl font-bold text-[#1C1917]">{totalNotes.toLocaleString()}</div>
            <div className="text-xs text-gray-400">篇</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">本月曝光</div>
            <div className="text-xl font-bold text-[#1C1917]">{formatShortNumber(totalExposure)}</div>
            <div className="text-xs text-gray-400">次</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">本月消费</div>
            <div className="text-xl font-bold text-[#1C1917]">¥{totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="text-xs text-gray-400">&nbsp;</div>
          </div>
          <div className="rounded-lg bg-[#FAFAF9] p-3">
            <div className="text-xs text-gray-400">本月留资</div>
            <div className="text-xl font-bold text-[#1C1917]">{totalDmLead.toLocaleString()}</div>
            <div className="text-xs text-gray-400">条</div>
          </div>
        </div>
      )}
    </div>
  );
}

