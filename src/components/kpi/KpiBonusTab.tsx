"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiFilterBar } from "./KpiFilterBar";

type Stats = Record<string, number>;
type Post = Record<string, unknown> & { engagementRate?: number; exposure?: number; impressions?: number; ctr?: number; spend?: number; views?: number; reach?: number; title?: string; publish_time?: string };

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="text-sm text-[#78716C]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[#1C1917]">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

function downloadCsv(posts: Post[], filename: string) {
  if (!posts.length) return;
  const keys = Object.keys(posts[0]);
  const lines = [keys.join(","), ...posts.map((p) => keys.map((k) => `"${String(p[k] ?? "").replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function KpiBonusTab() {
  const [sub, setSub] = useState<"organic" | "paid" | "summary" | "ig">("organic");
  const [filter, setFilter] = useState({ from: "", to: "", ae: "", building: "" });
  const [stats, setStats] = useState<Stats>({});
  const [paidStats, setPaidStats] = useState<Stats>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter.from) p.set("from", filter.from);
    if (filter.to) p.set("to", filter.to);
    if (filter.ae) p.set("ae", filter.ae);
    if (filter.building) p.set("building", filter.building);

    if (sub === "organic") {
      const [sRes, pRes] = await Promise.all([
        fetch(`/api/kpi/organic-stats?${p}`),
        fetch(`/api/kpi/top-posts?type=organic&${p}&all=1`),
      ]);
      setStats(await sRes.json().catch(() => ({})));
      setPosts(await pRes.json().catch(() => []));
    } else if (sub === "paid") {
      const [sRes, pRes] = await Promise.all([
        fetch(`/api/kpi/paid-stats?${p}`),
        fetch(`/api/kpi/top-posts?type=paid&${p}&all=1`),
      ]);
      setStats(await sRes.json().catch(() => ({})));
      setPosts(await pRes.json().catch(() => []));
    } else if (sub === "summary") {
      const [oRes, pdRes, opRes, ppRes] = await Promise.all([
        fetch(`/api/kpi/organic-stats?${p}`),
        fetch(`/api/kpi/paid-stats?${p}`),
        fetch(`/api/kpi/top-posts?type=organic&${p}&all=1`),
        fetch(`/api/kpi/top-posts?type=paid&${p}&all=1`),
      ]);
      const oStats = await oRes.json().catch(() => ({}));
      const pdStats = await pdRes.json().catch(() => ({}));
      setStats(oStats);
      setPaidStats(pdStats);
      const oPosts = await opRes.json().catch(() => []);
      const pPosts = await ppRes.json().catch(() => []);
      setPosts([...(Array.isArray(oPosts) ? oPosts : []).map((p: Post) => ({ ...p, _type: "organic" })), ...(Array.isArray(pPosts) ? pPosts : []).map((p: Post) => ({ ...p, _type: "paid" }))]);
    } else {
      const [sRes, pRes] = await Promise.all([
        fetch(`/api/kpi/ig-stats?${p}`),
        fetch(`/api/kpi/top-posts?type=ig&${p}&all=1`),
      ]);
      setStats(await sRes.json().catch(() => ({})));
      setPosts(await pRes.json().catch(() => []));
    }
    setLoading(false);
    setExpanded(false);
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
    { label: "展现量", value: stats.totalImpressions ?? 0 },
    { label: "平均 CTR", value: `${stats.avgCtr ?? 0}%` },
    { label: "花费", value: `¥${(stats.totalSpend ?? 0).toLocaleString()}` },
    { label: "Leads", value: stats.totalDmLead ?? 0 },
    { label: "Cost/DM In", value: `¥${stats.costPerDm ?? 0}` },
    { label: "Cost/Lead", value: `¥${stats.costPerLead ?? 0}` },
  ];
  const summaryCards = [
    { label: "帖子数", value: (stats.postCount ?? 0) + (paidStats.postCount ?? 0) },
    { label: "Organic 曝光", value: stats.totalExposure ?? 0 },
    { label: "Organic 互动率", value: `${stats.avgEngagementRate ?? 0}%` },
    { label: "Paid CTR", value: `${paidStats.avgCtr ?? 0}%` },
    { label: "Paid 花费", value: `¥${(paidStats.totalSpend ?? 0).toLocaleString()}` },
    { label: "Leads", value: paidStats.totalDmLead ?? 0 },
  ];
  const igCards = [
    { label: "帖子数", value: stats.postCount ?? 0 },
    { label: "总播放", value: stats.totalViews ?? 0 },
    { label: "总触达", value: stats.totalReach ?? 0 },
    { label: "平均互动率", value: `${stats.avgEngagementRate ?? 0}%` },
  ];

  const cards = sub === "organic" ? organicCards : sub === "paid" ? paidCards : sub === "summary" ? summaryCards : igCards;
  const postsArr = Array.isArray(posts) ? posts : [];
  const displayPosts = expanded ? postsArr : postsArr.slice(0, 10);

  return (
    <div>
      <KpiFilterBar {...filter} onChange={setFilter} showAeBuilding={sub !== "ig"} />
      <div className="mb-5 flex gap-1 border-b border-[#E7E5E4]">
        {(["organic", "paid", "summary", "ig"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setSub(k)} className={cn("flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors", sub === k ? "border-[#1C1917] text-[#1C1917]" : "border-transparent text-[#78716C] hover:text-[#1C1917]")}>
            {k === "organic" ? "Organic" : k === "paid" ? "Paid" : k === "summary" ? "Summary" : "Instagram"}
          </button>
        ))}
      </div>
      {loading ? <p className="py-12 text-center text-sm text-[#78716C]">加载中…</p> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            {cards.map((c) => <KpiCard key={c.label} {...c} />)}
          </div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#1C1917]">帖子数据 ({postsArr.length})</h3>
            {sub === "summary" && postsArr.length > 0 && (
              <button type="button" onClick={() => downloadCsv(postsArr, `kpi-summary-${filter.from || "all"}.csv`)} className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4]">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#E7E5E4]">
            <table className="w-full text-xs">
              <thead className="bg-[#FAFAF9] text-[#78716C]">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">标题</th>
                  <th className="px-3 py-2.5 text-left font-medium">发布时间</th>
                  {(sub === "organic" || sub === "summary") && <><th className="px-3 py-2.5 text-right font-medium">曝光</th><th className="px-3 py-2.5 text-right font-medium">互动率</th></>}
                  {(sub === "paid" || sub === "summary") && <><th className="px-3 py-2.5 text-right font-medium">展现</th><th className="px-3 py-2.5 text-right font-medium">CTR</th><th className="px-3 py-2.5 text-right font-medium">花费</th></>}
                  {sub === "ig" && <><th className="px-3 py-2.5 text-right font-medium">播放</th><th className="px-3 py-2.5 text-right font-medium">触达</th><th className="px-3 py-2.5 text-right font-medium">互动率</th></>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F4]">
                {displayPosts.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-[#78716C]">暂无数据</td></tr>
                ) : displayPosts.map((p, i) => (
                  <tr key={i} className="transition-colors hover:bg-[#FAFAF9]">
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-left text-[#1C1917]">
                      {p.title || <span className="italic text-[#A8A29E]">无标题</span>}
                    </td>
                    <td className="px-3 py-2.5 text-left text-[#78716C]">{p.publish_time?.slice(0, 10) || "—"}</td>
                    {(sub === "organic" || sub === "summary") && <>
                      <td className="px-3 py-2.5 text-right tabular-nums">{(p.exposure ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{String(p.engagementRate ?? 0)}%</td>
                    </>}
                    {(sub === "paid" || sub === "summary") && <>
                      <td className="px-3 py-2.5 text-right tabular-nums">{(p.impressions ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{String(p.ctr ?? 0)}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">¥{(p.spend ?? 0).toLocaleString()}</td>
                    </>}
                    {sub === "ig" && <>
                      <td className="px-3 py-2.5 text-right tabular-nums">{(p.views ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{(p.reach ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{String(p.engagementRate ?? 0)}%</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {postsArr.length > 10 && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 flex items-center gap-1 text-xs text-[#78716C] hover:text-[#1C1917]">
              {expanded ? <><ChevronUp className="h-3 w-3" /> 收起</> : <><ChevronDown className="h-3 w-3" /> 展开全部 ({postsArr.length})</>}
            </button>
          )}
        </>
      )}
    </div>
  );
}
