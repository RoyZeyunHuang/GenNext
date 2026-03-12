"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Eye, Trash2, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Report = {
  id: string; title: string; summary: string | null; date_from: string; date_to: string;
  aggregate_json: string | null; top_posts_json: string | null; created_at: string;
};

type Aggregate = { posts: number; accounts: number; exposure: number; engagement: number; dms: number; spend: number };
type TopPostItem = Record<string, unknown>;

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <div className="text-sm text-[#78716C]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[#1C1917]">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

export function CampaignReportTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchReports = useCallback(async () => {
    const res = await fetch("/api/kpi/campaign-reports");
    const data = await res.json().catch(() => []);
    setReports(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const deleteReport = async (id: string) => {
    await fetch(`/api/kpi/campaign-reports/${id}`, { method: "DELETE" });
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-[#1C1917]">报告列表</span>
          <button type="button" onClick={() => { setCreating(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90">
            <Plus className="h-3.5 w-3.5" /> New Report
          </button>
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto">
          {loading ? <p className="py-8 text-center text-sm text-[#78716C]">加载中…</p> : reports.length === 0 ? <p className="py-8 text-center text-sm text-[#78716C]">暂无报告</p> : reports.map((r) => (
            <div key={r.id} className={cn("rounded-lg border p-3 transition-colors", selected?.id === r.id ? "border-[#1C1917] bg-[#FAFAF9]" : "border-[#E7E5E4] bg-white")}>
              <div className="text-sm font-medium text-[#1C1917]">{r.title}</div>
              <div className="mt-0.5 text-xs text-[#78716C]">{r.date_from} → {r.date_to}</div>
              <div className="mt-0.5 text-[10px] text-[#A8A29E]">{new Date(r.created_at).toLocaleDateString("zh-CN")}</div>
              <div className="mt-2 flex gap-1">
                <button type="button" onClick={() => { setSelected(r); setCreating(false); }} className="flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] text-[#78716C] hover:bg-[#F5F5F4]"><Eye className="h-3 w-3" /> View</button>
                <button type="button" onClick={() => deleteReport(r.id)} className="flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3" /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg bg-white p-6 shadow-card">
        {creating ? (
          <NewReportForm onClose={() => setCreating(false)} onCreated={(r) => { setReports((prev) => [r, ...prev]); setCreating(false); setSelected(r); }} />
        ) : selected ? (
          <ReportView report={selected} />
        ) : (
          <p className="py-20 text-center text-sm text-[#78716C]">选择左侧报告查看，或点击「New Report」</p>
        )}
      </div>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  const agg: Aggregate = report.aggregate_json ? JSON.parse(report.aggregate_json) : {};
  const topPosts: TopPostItem[] = report.top_posts_json ? JSON.parse(report.top_posts_json) : [];

  return (
    <div>
      <h3 className="text-lg font-semibold text-[#1C1917]">{report.title}</h3>
      {report.summary && <p className="mt-1 text-sm text-[#78716C]">{report.summary}</p>}
      <div className="mt-1 text-xs text-[#A8A29E]">Campaign: {report.date_from} → {report.date_to}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Posts" value={agg.posts ?? 0} />
        <KpiCard label="Accounts" value={agg.accounts ?? 0} />
        <KpiCard label="Exposure" value={agg.exposure ?? 0} />
        <KpiCard label="Engagement" value={agg.engagement ?? 0} />
        <KpiCard label="DMs" value={agg.dms ?? 0} />
        <KpiCard label="Spend" value={`¥${(agg.spend ?? 0).toLocaleString()}`} />
      </div>
      {topPosts.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-3 text-sm font-medium text-[#1C1917]">Top Post</h4>
          {topPosts.slice(0, 1).map((p, i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              {(p.cover_url as string) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.cover_url as string} alt="" className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-[#F5F5F4] text-sm text-[#A8A29E]">无封面</div>
              )}
              <div className="p-4">
                <div className="text-sm font-medium text-[#1C1917]">
                  {(p.title as string) || <span className="italic text-[#A8A29E]">无标题</span>}
                </div>
                <div className="mt-1.5 text-xs text-[#A8A29E]">
                  曝光 {((p.exposure as number) ?? 0).toLocaleString()} · 互动 {((p.engagement as number) ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewReportForm({ onClose, onCreated }: { onClose: () => void; onCreated: (r: Report) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [posts, setPosts] = useState<{ post_key: string; title: string; exposure: number; selected: boolean }[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadPosts = async () => {
    if (!dateFrom || !dateTo) return;
    setPostsLoaded(false);
    const p = new URLSearchParams({ type: "organic", from: dateFrom, to: dateTo, all: "1" });
    const res = await fetch(`/api/kpi/top-posts?${p}`);
    const data = await res.json().catch(() => []);
    setPosts((Array.isArray(data) ? data : []).map((d: Record<string, unknown>) => ({
      post_key: (d.post_key as string) ?? "",
      title: (d.title as string) ?? "",
      exposure: (d.exposure as number) ?? 0,
      selected: true,
    })));
    setPostsLoaded(true);
  };

  const generate = async () => {
    const selectedPosts = posts.filter((p) => p.selected);
    if (!selectedPosts.length) return;
    setSaving(true);

    const postKeys = selectedPosts.map((p) => p.post_key);
    const totalExposure = selectedPosts.reduce((s, p) => s + p.exposure, 0);

    const p2 = new URLSearchParams({ type: "paid", from: dateFrom, to: dateTo, all: "1" });
    const paidRes = await fetch(`/api/kpi/top-posts?${p2}`);
    const paidPosts = await paidRes.json().catch(() => []);
    const paidFiltered = (Array.isArray(paidPosts) ? paidPosts : []).filter((p: Record<string, unknown>) => postKeys.includes(p.post_key as string));
    const totalSpend = paidFiltered.reduce((s: number, p: Record<string, unknown>) => s + ((p.spend as number) ?? 0), 0);
    const totalDms = paidFiltered.reduce((s: number, p: Record<string, unknown>) => s + ((p.dm_in as number) ?? 0) + ((p.dm_open as number) ?? 0) + ((p.dm_lead as number) ?? 0), 0);

    const { data: corePosts } = await fetch(`/api/kpi/top-posts?type=organic&from=${dateFrom}&to=${dateTo}&all=1`).then((r) => r.json()).then((d) => ({ data: Array.isArray(d) ? d : [] })).catch(() => ({ data: [] }));
    const relPosts = corePosts.filter((p: Record<string, unknown>) => postKeys.includes(p.post_key as string));
    const accounts = new Set(relPosts.map((p: Record<string, unknown>) => (p.account_nickname as string) ?? "").filter(Boolean));
    const totalEng = relPosts.reduce((s: number, p: Record<string, unknown>) => s + ((p.likes as number) ?? 0) + ((p.comments as number) ?? 0) + ((p.collects as number) ?? 0) + ((p.shares as number) ?? 0), 0);

    const topPost = selectedPosts.sort((a, b) => b.exposure - a.exposure)[0];
    const aggregate: Aggregate = {
      posts: selectedPosts.length,
      accounts: accounts.size,
      exposure: totalExposure,
      engagement: totalEng,
      dms: totalDms,
      spend: Math.round(totalSpend * 100) / 100,
    };

    const res = await fetch("/api/kpi/campaign-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, summary, date_from: dateFrom, date_to: dateTo,
        aggregate_json: aggregate,
        top_posts_json: [{ title: topPost?.title ?? "", exposure: topPost?.exposure ?? 0, engagement: 0 }],
      }),
    });
    const report = await res.json();
    if (!report.error) onCreated(report);
    setSaving(false);
  };

  const inputCls = "h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#1C1917]">新建 Campaign Report</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Campaign Title *" className={inputCls} />
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" rows={2} className={cn(inputCls, "h-auto py-2 resize-none")} />
        <div className="flex gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          <button type="button" onClick={loadPosts} disabled={!dateFrom || !dateTo} className="h-9 rounded-lg bg-[#1C1917] px-4 text-xs text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
            加载帖子
          </button>
        </div>
      </div>
      {postsLoaded && (
        <>
          <div className="mt-4 max-h-[240px] overflow-y-auto rounded-lg border border-[#E7E5E4] p-2">
            {posts.length === 0 ? <p className="py-4 text-center text-xs text-[#78716C]">该期间无帖子</p> : posts.map((p, i) => (
              <label key={i} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[#F5F5F4]">
                <input type="checkbox" checked={p.selected} onChange={() => setPosts((prev) => prev.map((pp, ii) => ii === i ? { ...pp, selected: !pp.selected } : pp))} className="rounded border-[#E7E5E4] text-[#1C1917] focus:ring-[#1C1917]/20" />
                <span className="flex-1 truncate text-xs text-[#1C1917]">{p.title || <span className="italic text-[#A8A29E]">无标题</span>}</span>
                <span className="text-[10px] text-[#A8A29E]">{p.exposure.toLocaleString()}</span>
              </label>
            ))}
          </div>
          <button type="button" onClick={generate} disabled={saving || !title.trim() || posts.filter((p) => p.selected).length === 0} className="mt-3 flex h-9 items-center gap-1 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Generate Report
          </button>
        </>
      )}
    </div>
  );
}
