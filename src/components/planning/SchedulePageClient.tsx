"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Calendar, List, Loader2, Sparkles, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddAccountModal, type GlobalAccount } from "./AddAccountModal";

const COLORS = ["#4a90d9", "#21c354", "#e67e22", "#9b59b6", "#e74c3c", "#1abc9c", "#f39c12", "#3498db"];
const STATUS_LABELS: Record<string, string> = { idea: "💡", scripted: "📝", ready: "✅", published: "🟢" };

type Plan = { id: string; title: string; date_from: string; date_to: string; theme: string | null; hooks: { name?: string }[]; accounts?: { id: string; account_name: string; color: string; hook_index: number; persona_name: string | null }[] };
type Item = { id: string; plan_id: string; account_id: string | null; publish_date: string; task_template_doc_id: string | null; brand_doc_ids: string[]; title: string | null; brief: string | null; script: string | null; status: string; account?: { account_name: string; color: string } };
type Doc = { id: string; title: string; category_id: string };

export function SchedulePageClient({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [taskDocs, setTaskDocs] = useState<Doc[]>([]);
  const [brandDocs, setBrandDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [globalAccounts, setGlobalAccounts] = useState<GlobalAccount[]>([]);

  const fetchPlan = useCallback(async () => {
    const res = await fetch(`/api/planning/${planId}`);
    const data = await res.json();
    if (res.ok) setPlan(data);
  }, [planId]);

  const fetchItems = useCallback(async () => {
    const res = await fetch(`/api/planning/${planId}/items`);
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
  }, [planId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchPlan();
      await fetchItems();
      setLoading(false);
    })();
  }, [fetchPlan, fetchItems]);

  useEffect(() => {
    fetch("/api/docs/categories").then((r) => r.json()).then((c: { id: string; name: string }[]) => setCategories(Array.isArray(c) ? c : []));
  }, []);
  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((a: GlobalAccount[]) => setGlobalAccounts(Array.isArray(a) ? a : []));
  }, []);
  const refreshGlobalAccounts = useCallback(() => {
    fetch("/api/accounts").then((r) => r.json()).then((a: GlobalAccount[]) => setGlobalAccounts(Array.isArray(a) ? a : []));
  }, []);
  const taskCatId = categories.find((c) => c.name === "任务模板")?.id;
  const brandCatId = categories.find((c) => c.name === "品牌档案")?.id;
  useEffect(() => {
    if (taskCatId) fetch(`/api/docs?category_id=${taskCatId}`).then((r) => r.json()).then((d: Doc[]) => setTaskDocs(Array.isArray(d) ? d : []));
  }, [taskCatId]);
  useEffect(() => {
    if (brandCatId) fetch(`/api/docs?category_id=${brandCatId}`).then((r) => r.json()).then((d: Doc[]) => setBrandDocs(Array.isArray(d) ? d : []));
  }, [brandCatId]);

  const accountMap = new Map((plan?.accounts ?? []).map((a) => [a.id, a]));
  const itemsWithAccount = items.map((it) => ({ ...it, account: it.account_id ? accountMap.get(it.account_id) : undefined }));

  const aiSchedule = async () => {
    setLoadingSchedule(true);
    await fetch("/api/ai/planning-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        date_from: plan?.date_from,
        date_to: plan?.date_to,
        theme: plan?.theme,
        hooks: plan?.hooks ?? [],
        accounts: plan?.accounts ?? [],
      }),
    });
    await fetchItems();
    setLoadingSchedule(false);
  };

  const addItem = async (publish_date: string) => {
    const res = await fetch(`/api/planning/${planId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish_date, title: "新内容", status: "idea" }),
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0]) setSelectedItemId(data[0].id);
    else if (data.id) setSelectedItemId(data.id);
    fetchItems();
  };

  const selectedItem = items.find((i) => i.id === selectedItemId);

  if (loading || !plan) return <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>;

  const from = new Date(plan.date_from);
  const to = new Date(plan.date_to);
  const days: { date: string; label: string; isToday: boolean }[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      isToday: dateStr === today,
    });
  }
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {plan.theme && <span className="rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-sm text-[#0369A1]">{plan.theme}</span>}
          {(plan.hooks ?? []).filter((h) => h.name).map((h, i) => <span key={i} className="rounded-full bg-[#F5F5F4] px-2.5 py-0.5 text-sm text-[#78716C]">{h.name}</span>)}
          {(plan.accounts ?? []).map((a) => <span key={a.id} className="rounded-full px-2.5 py-0.5 text-sm text-white" style={{ backgroundColor: a.color ?? "#999" }}>{a.account_name}</span>)}
          {!plan.theme && plan.accounts?.length === 0 && <span className="text-sm text-[#78716C]">自由排期</span>}
          <Link href={`/planning/${planId}/strategy`} className="text-sm text-blue-600 hover:underline">编辑策略</Link>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={aiSchedule} disabled={loadingSchedule} className="flex items-center gap-1.5 rounded-lg bg-[#1C1917] px-3 py-2 text-sm text-white">
            {loadingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 自动排期
          </button>
          <div className="flex rounded-lg border border-[#E7E5E4] p-0.5">
            <button type="button" onClick={() => setViewMode("calendar")} className={cn("rounded-md p-1.5", viewMode === "calendar" ? "bg-[#1C1917] text-white" : "text-[#78716C]")}><Calendar className="h-4 w-4" /></button>
            <button type="button" onClick={() => setViewMode("list")} className={cn("rounded-md p-1.5", viewMode === "list" ? "bg-[#1C1917] text-white" : "text-[#78716C]")}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <div className="overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex gap-px mb-2">
              <div className="w-14 shrink-0 flex items-center text-xs text-[#78716C]">第{wi + 1}周</div>
              <div className="flex flex-1 gap-2 min-w-0">
                {week.map((day) => (
                  <div key={day.date} className="min-w-[140px] flex-1 rounded-lg border border-[#E7E5E4] min-h-[120px] p-2 bg-white">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs text-[#78716C]">{day.label}</span>
                      {day.isToday && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    </div>
                    <div className="space-y-1.5">
                      {itemsWithAccount.filter((i) => i.publish_date === day.date).map((it) => (
                        <div
                          key={it.id}
                          onClick={() => setSelectedItemId(it.id)}
                          className="rounded border border-[#E7E5E4] p-2 cursor-pointer hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center gap-1">
                            <span className="w-0.5 h-4 rounded-full shrink-0" style={{ backgroundColor: it.account?.color ?? "#D6D3D1" }} />
                            <span className="text-xs text-[#78716C] truncate">{it.account?.account_name ?? "未分配"}</span>
                          </div>
                          <p className="text-sm text-[#1C1917] line-clamp-2 mt-0.5">{it.title || it.brief || "无标题"}</p>
                          <p className="text-xs text-[#A8A29E]">{STATUS_LABELS[it.status] ?? it.status}</p>
                        </div>
                      ))}
                      <button type="button" onClick={() => addItem(day.date)} className="w-full rounded border border-dashed border-[#D6D3D1] py-1.5 text-xs text-[#78716C] hover:border-[#1C1917] hover:text-[#1C1917]">
                        <Plus className="h-3 w-3 inline mr-0.5" /> 添加
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[#E7E5E4] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E4] bg-[#FAFAF9]">
                <th className="px-4 py-3 text-left font-medium text-[#1C1917]">日期</th>
                <th className="px-4 py-3 text-left font-medium text-[#1C1917]">账号</th>
                <th className="px-4 py-3 text-left font-medium text-[#1C1917]">标题方向</th>
                <th className="px-4 py-3 text-left font-medium text-[#1C1917]">状态</th>
              </tr>
            </thead>
            <tbody>
              {itemsWithAccount.map((it) => (
                <tr key={it.id} className="border-b border-[#E7E5E4] hover:bg-[#FAFAF9] cursor-pointer" onClick={() => setSelectedItemId(it.id)}>
                  <td className="px-4 py-3 text-[#78716C]">{it.publish_date}</td>
                  <td className="px-4 py-3">
                    <span className="rounded px-2 py-0.5 text-xs text-white" style={{ backgroundColor: it.account?.color ?? "#999" }}>{it.account?.account_name ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-[#1C1917]">{it.title || it.brief || "—"}</td>
                  <td className="px-4 py-3 text-[#78716C]">{STATUS_LABELS[it.status] ?? it.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="py-12 text-center text-sm text-[#78716C]">暂无内容，点击「AI 自动排期」或日历格中「+」添加</div>}
        </div>
      )}

      {selectedItemId && (
        <ContentDrawer
          planId={planId}
          item={selectedItem}
          planAccounts={plan?.accounts ?? []}
          globalAccounts={globalAccounts}
          refreshGlobalAccounts={refreshGlobalAccounts}
          fetchPlan={fetchPlan}
          taskDocs={taskDocs}
          brandDocs={brandDocs}
          onClose={() => setSelectedItemId(null)}
          onSaved={() => { fetchItems(); fetchPlan(); }}
          onPrev={() => { const idx = items.findIndex((i) => i.id === selectedItemId); if (idx > 0) setSelectedItemId(items[idx - 1].id); }}
          onNext={() => { const idx = items.findIndex((i) => i.id === selectedItemId); if (idx >= 0 && idx < items.length - 1) setSelectedItemId(items[idx + 1].id); }}
          onDelete={() => { setSelectedItemId(null); fetchItems(); }}
        />
      )}
    </div>
  );
}

function ContentDrawer({
  planId,
  item,
  planAccounts,
  globalAccounts,
  refreshGlobalAccounts,
  fetchPlan,
  taskDocs,
  brandDocs,
  onClose,
  onSaved,
  onPrev,
  onNext,
  onDelete,
}: {
  planId: string;
  item: Item | undefined;
  planAccounts: { id: string; account_name: string; color: string }[];
  globalAccounts: GlobalAccount[];
  refreshGlobalAccounts: () => void;
  fetchPlan: () => Promise<void>;
  taskDocs: Doc[];
  brandDocs: Doc[];
  onClose: () => void;
  onSaved: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [loadingScript, setLoadingScript] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [form, setForm] = useState({ title: "", brief: "", script: "", cover_idea: "", comment_guide: "", tags: [] as string[], status: "idea" });
  const saveTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null };

  useEffect(() => {
    if (!item) return;
    setForm({
      title: item.title ?? "",
      brief: item.brief ?? "",
      script: item.script ?? "",
      cover_idea: "",
      comment_guide: "",
      tags: (item as { tags?: string[] }).tags ?? [],
      status: item.status ?? "idea",
    });
  }, [item?.id]);

  const debouncedSave = (payload: Record<string, unknown>) => {
    if (!item?.id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      await fetch(`/api/planning/items/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setSaving(false);
      onSaved();
    }, 500);
  };

  const resolvePlanAccountId = async (globalName: string, color: string | null): Promise<string | null> => {
    const existing = planAccounts.find((a) => a.account_name === globalName);
    if (existing) return existing.id;
    const res = await fetch(`/api/planning/${planId}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_name: globalName, color: color || undefined, sort_order: planAccounts.length }),
    });
    const created = await res.json();
    if (created?.id) return created.id;
    return null;
  };

  const setItemAccount = async (globalAccount: GlobalAccount) => {
    if (!item?.id) return;
    const planAccountId = await resolvePlanAccountId(globalAccount.name, globalAccount.color);
    if (!planAccountId) return;
    await fetch(`/api/planning/items/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: planAccountId }) });
    await fetchPlan();
    onSaved();
  };

  const generateScript = async () => {
    if (!item) return;
    setLoadingScript(true);
    const acc = planAccounts.find((a) => a.id === item.account_id);
    const res = await fetch("/api/ai/planning-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: "",
        hook_name: "",
        hook_description: "",
        title_direction: item.title,
        brief: item.brief,
        property_name: (item as { property_name?: string }).property_name,
        brand_doc_ids: item.brand_doc_ids ?? [],
        task_template_doc_id: item.task_template_doc_id,
        persona_doc_id: null,
      }),
    });
    const data = await res.json();
    setLoadingScript(false);
    if (data.title) setForm((f) => ({ ...f, title: data.title, script: data.script ?? f.script, cover_idea: data.cover_idea ?? f.cover_idea, comment_guide: data.comment_guide ?? f.comment_guide, tags: data.hashtags ?? f.tags }));
    debouncedSave({ title: data.title, script: data.script, cover_idea: data.cover_idea, comment_guide: data.comment_guide, tags: data.hashtags });
  };

  const setStatus = async (status: string) => {
    if (!item?.id) return;
    await fetch(`/api/planning/items/${item.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setForm((f) => ({ ...f, status }));
    onSaved();
  };

  if (!item) return null;

  const acc = planAccounts.find((a) => a.id === item.account_id);
  const selectedGlobal = globalAccounts.find((g) => g.name === acc?.account_name);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-[520px] max-w-full bg-white shadow-xl flex flex-col h-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-[#E7E5E4] flex items-center justify-between">
          <span className="text-sm text-[#78716C]">{item.publish_date} · {acc ? <span className="rounded px-1.5 py-0.5 text-white text-xs" style={{ backgroundColor: acc.color }}>{acc.account_name}</span> : "未分配"}</span>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-[#78716C]">账号</label>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <select
                value={selectedGlobal?.id ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const g = globalAccounts.find((x) => x.id === id);
                  if (g) setItemAccount(g);
                }}
                className="h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm min-w-[140px]"
              >
                <option value="">选择账号</option>
                {globalAccounts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowAddAccountModal(true)} className="text-xs text-blue-600 hover:underline">+ 新增账号</button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[#78716C]">标题</label>
            <input value={form.title} onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); debouncedSave({ title: e.target.value }); }} className="mt-1 w-full h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#78716C]">简述</label>
            <input value={form.brief} onChange={(e) => { setForm((f) => ({ ...f, brief: e.target.value })); debouncedSave({ brief: e.target.value }); }} className="mt-1 w-full h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm" />
          </div>
          <button type="button" onClick={generateScript} disabled={loadingScript} className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm text-[#78716C] hover:bg-[#F5F5F4]">
            {loadingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 生成脚本
          </button>
          <div>
            <label className="text-xs font-medium text-[#78716C]">脚本</label>
            <textarea value={form.script} onChange={(e) => { setForm((f) => ({ ...f, script: e.target.value })); debouncedSave({ script: e.target.value }); }} rows={8} className="mt-1 w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#78716C]">封面思路</label>
            <input value={form.cover_idea} onChange={(e) => { setForm((f) => ({ ...f, cover_idea: e.target.value })); debouncedSave({ cover_idea: e.target.value }); }} className="mt-1 w-full h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#78716C]">评论区引导</label>
            <input value={form.comment_guide} onChange={(e) => { setForm((f) => ({ ...f, comment_guide: e.target.value })); debouncedSave({ comment_guide: e.target.value }); }} className="mt-1 w-full h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm" />
          </div>
          <div>
            <span className="text-xs font-medium text-[#78716C]">状态</span>
            <div className="mt-1 flex gap-1">
              {(["idea", "scripted", "ready", "published"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={cn("rounded-lg border px-2 py-1 text-xs", form.status === s ? "border-[#1C1917] bg-[#1C1917] text-white" : "border-[#E7E5E4] text-[#78716C]")}>
                  {STATUS_LABELS[s]} {s === "idea" ? "想法" : s === "scripted" ? "脚本" : s === "ready" ? "就绪" : "已发"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-[#E7E5E4] flex items-center justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={onPrev} className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm text-[#78716C]">上一条</button>
            <button type="button" onClick={onNext} className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm text-[#78716C]">下一条</button>
          </div>
          <button type="button" onClick={async () => { if (confirm("确定删除？")) { await fetch(`/api/planning/items/${item.id}`, { method: "DELETE" }); onDelete(); } }} className="text-sm text-red-600 hover:underline">删除</button>
        </div>
      </div>
      {showAddAccountModal && (
        <AddAccountModal
          onClose={() => setShowAddAccountModal(false)}
          onSuccess={async (account) => {
            refreshGlobalAccounts();
            await setItemAccount(account);
            setShowAddAccountModal(false);
          }}
        />
      )}
    </div>
  );
}
