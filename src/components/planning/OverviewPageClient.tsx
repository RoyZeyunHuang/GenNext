"use client";

import { useState, useEffect } from "react";
import { Download } from "lucide-react";

const STATUS_LABELS: Record<string, string> = { idea: "想法", scripted: "脚本", ready: "就绪", published: "已发布" };

type Plan = { id: string; title: string; date_from: string; date_to: string; theme: string | null; accounts?: { id: string; account_name: string; color: string }[] };
type Item = { id: string; publish_date: string; account_id: string | null; title: string | null; brief: string | null; script: string | null; cover_idea: string | null; comment_guide: string | null; tags: string[]; status: string };

export function OverviewPageClient({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/planning/${planId}`).then((r) => r.json()),
      fetch(`/api/planning/${planId}/items`).then((r) => r.json()),
    ]).then(([p, list]) => {
      setPlan(p);
      setItems(Array.isArray(list) ? list : []);
      setLoading(false);
    });
  }, [planId]);

  const accountMap = new Map((plan?.accounts ?? []).map((a) => [a.id, a]));
  const byStatus = items.reduce((acc, it) => { acc[it.status] = (acc[it.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const byAccount = items.reduce((acc, it) => {
    const name = it.account_id ? accountMap.get(it.account_id)?.account_name ?? "未分配" : "未分配";
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const exportCsv = () => {
    const headers = ["日期", "账号", "标题", "简述", "脚本", "封面思路", "评论引导", "标签", "状态"];
    const rows = items.map((it) => {
      const acc = it.account_id ? accountMap.get(it.account_id) : null;
      return [
        it.publish_date,
        acc?.account_name ?? "",
        (it.title ?? "").replace(/"/g, '""'),
        (it.brief ?? "").replace(/"/g, '""'),
        (it.script ?? "").replace(/"/g, '""').replace(/\n/g, " "),
        (it.cover_idea ?? "").replace(/"/g, '""'),
        (it.comment_guide ?? "").replace(/"/g, '""'),
        (it.tags ?? []).join(";"),
        STATUS_LABELS[it.status] ?? it.status,
      ].map((c) => `"${c}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${plan?.title ?? "排期"}-导出.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading || !plan) return <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-end">
        <button type="button" onClick={exportCsv} className="flex items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-sm font-medium text-white">
          <Download className="h-4 w-4" /> 导出 CSV
        </button>
      </div>

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h3 className="text-base font-semibold text-[#1C1917] mb-4">统计</h3>
        <p className="text-sm text-[#78716C]">总内容条数：<span className="font-medium text-[#1C1917]">{items.length}</span></p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(byStatus).map(([status, count]) => (
            <span key={status} className="rounded-full bg-[#F5F5F4] px-3 py-1 text-sm text-[#78716C]">
              {STATUS_LABELS[status] ?? status}：{count}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h3 className="text-base font-semibold text-[#1C1917] mb-4">各账号内容数量</h3>
        <div className="space-y-2">
          {Object.entries(byAccount).map(([name, count]) => (
            <div key={name} className="flex items-center gap-3">
              <span className="w-24 text-sm text-[#78716C]">{name}</span>
              <div className="flex-1 h-6 rounded-full bg-[#F5F5F4] overflow-hidden">
                <div className="h-full bg-[#1C1917] rounded-full" style={{ width: `${items.length ? (count / items.length) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-medium text-[#1C1917]">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h3 className="text-base font-semibold text-[#1C1917] mb-4">时间线</h3>
        <div className="space-y-1 text-sm">
          {items.slice().sort((a, b) => a.publish_date.localeCompare(b.publish_date)).map((it) => (
            <div key={it.id} className="flex items-center gap-3 py-1">
              <span className="w-24 text-[#78716C]">{it.publish_date}</span>
              <span className="text-[#1C1917]">{it.account_id ? accountMap.get(it.account_id)?.account_name : "—"}</span>
              <span className="flex-1 truncate text-[#78716C]">{it.title || it.brief || "—"}</span>
              <span className="text-[#A8A29E]">{STATUS_LABELS[it.status] ?? it.status}</span>
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="text-sm text-[#A8A29E]">暂无内容</p>}
      </div>
    </div>
  );
}
