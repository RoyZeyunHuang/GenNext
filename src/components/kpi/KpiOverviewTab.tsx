"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { KpiFilterBar } from "./KpiFilterBar";

type Stats = Record<string, number>;
type TopPost = Record<string, unknown>;

const SUB_TABS = [
  { key: "organic", label: "小红书 Organic" },
  { key: "paid", label: "小红书 Paid" },
  { key: "ig", label: "Instagram" },
] as const;

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="text-sm text-[#78716C]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[#1C1917]">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

export function KpiOverviewTab() {
  const [sub, setSub] = useState<"organic" | "paid" | "ig">("organic");
  const [filter, setFilter] = useState({ from: "", to: "", ae: "", building: "" });
  const [stats, setStats] = useState<Stats>({});
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter.from) p.set("from", filter.from);
    if (filter.to) p.set("to", filter.to);
    if (filter.ae) p.set("ae", filter.ae);
    if (filter.building) p.set("building", filter.building);

    const endpoint = sub === "organic" ? "organic-stats" : sub === "paid" ? "paid-stats" : "ig-stats";
    const [sRes, tRes] = await Promise.all([
      fetch(`/api/kpi/${endpoint}?${p}`),
      fetch(`/api/kpi/top-posts?type=${sub}&${p}&limit=5`),
    ]);
    const sData = await sRes.json().catch(() => ({}));
    const tData = await tRes.json().catch(() => []);
    setStats(sData.error ? {} : sData);
    setTopPosts(Array.isArray(tData) ? tData : []);
    setLoading(false);
  }, [sub, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const organicCards = [
    { label: "帖子数", value: stats.postCount ?? 0 },
    { label: "总曝光", value: stats.totalExposure ?? 0 },
    { label: "平均互动率", value: `${stats.avgEngagementRate ?? 0}%` },
    { label: "封面点击率", value: `${stats.avgCoverCtr ?? 0}%` },
  ];
  const paidCards = [
    { label: "帖子数", value: stats.postCount ?? 0 },
    { label: "总展现量", value: stats.totalImpressions ?? 0 },
    { label: "总花费", value: `¥${(stats.totalSpend ?? 0).toLocaleString()}` },
    { label: "平均 CTR", value: `${stats.avgCtr ?? 0}%` },
    { label: "总互动", value: stats.totalInteractions ?? 0 },
    { label: "总 DM 进线", value: stats.totalDmIn ?? 0 },
    { label: "Cost/DM", value: `¥${stats.costPerDm ?? 0}` },
  ];
  const igCards = [
    { label: "帖子数", value: stats.postCount ?? 0 },
    { label: "总播放", value: stats.totalViews ?? 0 },
    { label: "总触达", value: stats.totalReach ?? 0 },
    { label: "平均互动率", value: `${stats.avgEngagementRate ?? 0}%` },
  ];

  const cards = sub === "organic" ? organicCards : sub === "paid" ? paidCards : igCards;

  return (
    <div>
      <KpiFilterBar {...filter} onChange={setFilter} showAeBuilding={sub !== "ig"} />
      <div className="mb-5 flex gap-1 border-b border-[#E7E5E4]">
        {SUB_TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setSub(t.key)} className={cn("flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors", sub === t.key ? "border-[#1C1917] text-[#1C1917]" : "border-transparent text-[#78716C] hover:text-[#1C1917]")}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-[#78716C]">加载中…</p>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            {cards.map((c) => <KpiCard key={c.label} {...c} />)}
          </div>
          <h3 className="mb-4 text-sm font-medium text-[#1C1917]">Top 5 帖子</h3>
          <div className="grid gap-4 sm:grid-cols-5">
            {topPosts.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-[#78716C]">暂无数据</p>
            ) : (
              topPosts.map((p, i) => (
                <div key={i} className="group rounded-lg border border-[#E7E5E4] bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  {(p.cover_url as string) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_url as string} alt="" className="mb-2.5 h-28 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="mb-2.5 flex h-28 w-full items-center justify-center rounded-lg bg-[#F5F5F4] text-xs text-[#A8A29E]">无封面</div>
                  )}
                  <div className="text-xs font-medium text-[#1C1917] line-clamp-2">
                    {(p.title as string) || <span className="italic text-[#A8A29E]">无标题</span>}
                  </div>
                  <div className="mt-1.5 text-[11px] text-[#A8A29E]">
                    {sub === "organic" && `曝光 ${((p.exposure as number) ?? 0).toLocaleString()} · 互动率 ${p.engagementRate}%`}
                    {sub === "paid" && `展现 ${((p.impressions as number) ?? 0).toLocaleString()} · CTR ${p.ctr}%`}
                    {sub === "ig" && `播放 ${((p.views as number) ?? 0).toLocaleString()} · 互动率 ${p.engagementRate}%`}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
