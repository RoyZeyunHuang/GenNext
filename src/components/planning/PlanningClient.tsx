"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, X, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  title: string;
  date_from: string;
  date_to: string;
  theme: string | null;
  hooks: { name?: string }[];
  status: string;
  updated_at: string;
  item_count?: number;
  item_done?: number;
  accounts?: { color: string }[];
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-[#F5F5F4] text-[#78716C]" },
  scheduled: { label: "已排期", className: "bg-[#E0F2FE] text-[#0369A1]" },
  in_progress: { label: "进行中", className: "bg-[#FEF3C7] text-[#B45309]" },
  done: { label: "已完成", className: "bg-[#D1FAE5] text-[#047857]" },
};

function getDefaultTitle() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const w = Math.ceil(d.getDate() / 7);
  return `${m}月W${w}排期`;
}

function formatDateRange(from: string, to: string) {
  const a = from.split("-");
  const b = to.split("-");
  if (a.length >= 3 && b.length >= 3) return `${Number(a[1])}/${Number(a[2])} - ${Number(b[1])}/${Number(b[2])}`;
  return `${from} - ${to}`;
}

export function PlanningClient() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newPlanModal, setNewPlanModal] = useState(false);
  const [menuPlanId, setMenuPlanId] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("with_counts", "true");
    const res = await fetch(`/api/planning?${params}`);
    const data = await res.json();
    setPlans(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanDateFrom, setNewPlanDateFrom] = useState("");
  const [newPlanDateTo, setNewPlanDateTo] = useState("");

  const setQuickRange = (range: "week" | "nextWeek" | "month" | "nextMonth") => {
    const d = new Date();
    let from: Date, to: Date;
    if (range === "week") {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      from = new Date(d);
      from.setDate(d.getDate() + diff);
      to = new Date(from);
      to.setDate(from.getDate() + 6);
    } else if (range === "nextWeek") {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      from = new Date(d);
      from.setDate(d.getDate() + diff + 7);
      to = new Date(from);
      to.setDate(from.getDate() + 6);
    } else if (range === "month") {
      from = new Date(d.getFullYear(), d.getMonth(), 1);
      to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    } else {
      from = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      to = new Date(d.getFullYear(), d.getMonth() + 2, 0);
    }
    setNewPlanDateFrom(from.toISOString().slice(0, 10));
    setNewPlanDateTo(to.toISOString().slice(0, 10));
  };

  const submitNewPlan = async (entry: "strategy" | "schedule") => {
    const title = newPlanTitle.trim() || getDefaultTitle();
    if (!newPlanDateFrom || !newPlanDateTo) return;
    const res = await fetch("/api/planning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        date_from: newPlanDateFrom,
        date_to: newPlanDateTo,
        status: "draft",
      }),
    });
    const plan = await res.json();
    if (!res.ok) return;
    setNewPlanModal(false);
    setNewPlanTitle("");
    setNewPlanDateFrom("");
    setNewPlanDateTo("");
    fetchPlans();
    if (entry === "strategy") router.push(`/planning/${plan.id}/strategy`);
    else router.push(`/planning/${plan.id}/schedule`);
  };

  const deletePlan = async (id: string) => {
    if (!confirm("确定删除该计划？")) return;
    await fetch(`/api/planning/${id}`, { method: "DELETE" });
    setMenuPlanId(null);
    fetchPlans();
  };

  const duplicatePlan = async (id: string) => {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    const res = await fetch("/api/planning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: plan.title + " (副本)",
        date_from: plan.date_from,
        date_to: plan.date_to,
        theme: plan.theme,
        hooks: plan.hooks,
        strategy_notes: null,
        status: "draft",
      }),
    });
    if (res.ok) fetchPlans();
    setMenuPlanId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题或主题…"
            className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setNewPlanModal(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white hover:bg-[#1C1917]/90"
        >
          <Plus className="h-4 w-4" /> 新建排期
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] py-12 text-center text-sm text-[#78716C]">暂无计划，点击右上角「新建排期」创建</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onClick={() => router.push(`/planning/${plan.id}/schedule`)}
              menuOpen={menuPlanId === plan.id}
              onMenuToggle={() => setMenuPlanId(menuPlanId === plan.id ? null : plan.id)}
              onEdit={() => { setMenuPlanId(null); router.push(`/planning/${plan.id}/strategy`); }}
              onDuplicate={() => duplicatePlan(plan.id)}
              onDelete={() => deletePlan(plan.id)}
            />
          ))}
        </div>
      )}

      {newPlanModal && (
        <NewPlanModal
          title={newPlanTitle}
          setTitle={setNewPlanTitle}
          dateFrom={newPlanDateFrom}
          dateTo={newPlanDateTo}
          setDateFrom={setNewPlanDateFrom}
          setDateTo={setNewPlanDateTo}
          setQuickRange={setQuickRange}
          onClose={() => setNewPlanModal(false)}
          onSubmit={submitNewPlan}
        />
      )}
    </div>
  );
}

function PlanCard({
  plan,
  onClick,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  plan: Plan;
  onClick: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const done = plan.item_done ?? 0;
  const total = plan.item_count ?? 0;
  const statusInfo = STATUS_CONFIG[plan.status] ?? { label: plan.status, className: "bg-[#F5F5F4] text-[#78716C]" };

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 font-semibold text-[#1C1917] line-clamp-1">{plan.title}</h3>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.className)}>
          {statusInfo.label}
        </span>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
            className="rounded p-1 text-[#A8A29E] opacity-0 group-hover:opacity-100 hover:bg-[#F5F5F4]"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); onMenuToggle(); }} />
              <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-[#E7E5E4] bg-white py-1 shadow-lg">
                <button type="button" onClick={onEdit} className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#F5F5F4]">编辑</button>
                <button type="button" onClick={onDuplicate} className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#F5F5F4]">复制</button>
                <button type="button" onClick={onDelete} className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50">删除</button>
              </div>
            </>
          )}
        </div>
      </div>
      {plan.theme && (
        <span className="mt-1.5 inline-block rounded-full bg-[#E0F2FE] px-2 py-0.5 text-xs text-[#0369A1]">
          {plan.theme}
        </span>
      )}
      <p className="mt-1.5 text-xs text-[#78716C]">{formatDateRange(plan.date_from, plan.date_to)}</p>
      {(plan.accounts?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {plan.accounts!.map((a, i) => (
            <span key={i} className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} title="账号" />
          ))}
        </div>
      )}
      {total > 0 && (
        <p className="mt-1 text-xs text-[#A8A29E]">进度 {done}/{total}</p>
      )}
      <p className="mt-2 text-xs text-[#A8A29E]">
        更新于 {plan.updated_at ? new Date(plan.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
      </p>
    </div>
  );
}

function NewPlanModal({
  title,
  setTitle,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  setQuickRange,
  onClose,
  onSubmit,
}: {
  title: string;
  setTitle: (s: string) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (s: string) => void;
  setDateTo: (s: string) => void;
  setQuickRange: (r: "week" | "nextWeek" | "month" | "nextMonth") => void;
  onClose: () => void;
  onSubmit: (entry: "strategy" | "schedule") => void;
}) {
  const [step, setStep] = useState<"choose" | "form">("choose");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {step === "choose" ? (
          <>
            <h3 className="text-lg font-semibold text-[#1C1917]">你想怎么开始？</h3>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="flex w-full items-start gap-3 rounded-lg border border-[#E7E5E4] p-4 text-left hover:bg-[#FAFAF9]"
              >
                <span className="text-2xl">🎯</span>
                <div>
                  <p className="font-medium text-[#1C1917]">从策略开始</p>
                  <p className="text-sm text-[#78716C]">先定主题和钩子，再排内容</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStep("form")}
                className="flex w-full items-start gap-3 rounded-lg border border-[#E7E5E4] p-4 text-left hover:bg-[#FAFAF9]"
              >
                <span className="text-2xl">📅</span>
                <div>
                  <p className="font-medium text-[#1C1917]">直接排期</p>
                  <p className="text-sm text-[#78716C]">跳过策略，直接安排内容日历</p>
                </div>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C]">取消</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#1C1917]">新建排期</h3>
              <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">计划标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={getDefaultTitle()}
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#78716C]">日期范围</label>
                <div className="flex gap-2 mb-2">
                  {(["week", "nextWeek", "month", "nextMonth"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setQuickRange(r)}
                      className="rounded-lg border border-[#E7E5E4] px-2 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
                    >
                      {r === "week" ? "本周" : r === "nextWeek" ? "下周" : r === "month" ? "本月" : "下月"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-[#E7E5E4] px-3 text-sm"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-[#E7E5E4] px-3 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setStep("choose")} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C]">上一步</button>
              <button
                type="button"
                onClick={() => onSubmit("strategy")}
                disabled={!dateFrom || !dateTo}
                className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                从策略开始 →
              </button>
              <button
                type="button"
                onClick={() => onSubmit("schedule")}
                disabled={!dateFrom || !dateTo}
                className="h-9 rounded-lg border border-[#1C1917] px-4 text-sm font-medium text-[#1C1917] disabled:opacity-50"
              >
                直接排期 →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
