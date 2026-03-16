"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GlobalAccount } from "./AddAccountModal";

const DRIVERS = ["情感共鸣", "稀缺特权", "社交证明", "安全感", "身份感", "其他"];
const COLORS = ["#4a90d9", "#21c354", "#e67e22", "#9b59b6", "#e74c3c", "#1abc9c", "#f39c12", "#3498db"];

type Hook = { name: string; description: string; driver: string };
type Account = {
  id?: string;
  account_name: string;
  hook_index: number;
  persona_doc_id: string | null;
  persona_name: string | null;
  color: string;
  positioning: string;
};
type Plan = {
  id: string;
  title: string;
  date_from: string;
  date_to: string;
  theme: string | null;
  hooks: Hook[];
  strategy_notes: string | null;
  accounts?: Account[];
};
type Doc = { id: string; title: string; category_id: string };

export function StrategyPageClient({ planId }: { planId: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState("");
  const [hooks, setHooks] = useState<Hook[]>([{ name: "", description: "", driver: "其他" }, { name: "", description: "", driver: "其他" }]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [strategyNotes, setStrategyNotes] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [personaDocs, setPersonaDocs] = useState<Doc[]>([]);
  const [globalAccounts, setGlobalAccounts] = useState<GlobalAccount[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const fetchPlan = useCallback(async () => {
    const res = await fetch(`/api/planning/${planId}`);
    const data = await res.json();
    if (!res.ok) return;
    setPlan(data);
    setTheme(data.theme ?? "");
    setHooks(Array.isArray(data.hooks) && data.hooks.length >= 1 ? data.hooks : [{ name: "", description: "", driver: "其他" }, { name: "", description: "", driver: "其他" }]);
    setStrategyNotes(data.strategy_notes ?? "");
    setAccounts((data.accounts ?? []).map((a: Account) => ({ ...a, persona_name: a.persona_name ?? null })));
  }, [planId]);

  useEffect(() => {
    fetchPlan().then(() => setLoading(false));
  }, [fetchPlan]);

  useEffect(() => {
    fetch("/api/docs/categories").then((r) => r.json()).then((c: { id: string; name: string }[]) => setCategories(Array.isArray(c) ? c : []));
  }, []);
  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((a: GlobalAccount[]) => setGlobalAccounts(Array.isArray(a) ? a : []));
  }, []);
  const personaCategoryId = categories.find((c) => c.name === "人格模板")?.id;
  useEffect(() => {
    if (!personaCategoryId) return;
    fetch(`/api/docs?category_id=${personaCategoryId}`).then((r) => r.json()).then((d: Doc[]) => setPersonaDocs(Array.isArray(d) ? d : []));
  }, [personaCategoryId]);

  const savePlan = async (payload: Partial<Plan>) => {
    setSaving(true);
    await fetch(`/api/planning/${planId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    fetchPlan();
  };

  const aiThemes = async () => {
    setLoadingThemes(true);
    const res = await fetch("/api/ai/planning-themes", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    setLoadingThemes(false);
    if (data.themes?.[0]) setTheme(data.themes[0]);
  };

  const aiHooks = async () => {
    if (!theme.trim()) return;
    setLoadingHooks(true);
    const res = await fetch("/api/ai/planning-hooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) });
    const data = await res.json();
    setLoadingHooks(false);
    if (data.hooks?.length) setHooks(data.hooks);
  };

  const aiAccounts = async () => {
    setLoadingAccounts(true);
    const res = await fetch("/api/ai/planning-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hooks: hooks.filter((h) => h.name.trim()),
        personas: personaDocs.map((p) => ({ id: p.id, title: p.title })),
      }),
    });
    const data = await res.json();
    setLoadingAccounts(false);
    if (data.accounts?.length) {
      const withIds = data.accounts.map((a: Account, i: number) => ({
        ...a,
        sort_order: i,
      }));
      for (const acc of withIds) {
        const postRes = await fetch(`/api/planning/${planId}/accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(acc),
        });
        const created = await postRes.json();
        if (created.id) acc.id = created.id;
      }
      setAccounts(withIds);
      fetchPlan();
    }
  };

  const aiSummary = async () => {
    setLoadingSummary(true);
    const res = await fetch("/api/ai/planning-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme,
        hooks: hooks.filter((h) => h.name.trim() || h.description.trim()),
        accounts: accounts.map((a) => ({ account_name: a.account_name, persona_name: a.persona_name, positioning: a.positioning })),
      }),
    });
    const data = await res.json();
    setLoadingSummary(false);
    if (data.summary) setStrategyNotes(data.summary);
  };

  const addHook = () => setHooks((h) => [...h, { name: "", description: "", driver: "其他" }]);
  const removeHook = (i: number) => setHooks((h) => (h.length <= 1 ? h : h.filter((_, j) => j !== i)));
  const updateHook = (i: number, field: keyof Hook, value: string) => {
    setHooks((h) => h.map((x, j) => (j === i ? { ...x, [field]: value } : x)));
  };

  const addAccount = async () => {
    const res = await fetch(`/api/planning/${planId}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_name: "",
        color: COLORS[accounts.length % COLORS.length],
        sort_order: accounts.length,
      }),
    });
    const created = await res.json();
    if (created.id) setAccounts((a) => [...a, { ...created, persona_name: created.persona_name ?? null }]);
    fetchPlan();
  };
  const updateAccount = async (idx: number, updates: Partial<Account>) => {
    const acc = accounts[idx];
    if (!acc?.id) return;
    await fetch(`/api/planning/accounts/${acc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setAccounts((a) => a.map((x, j) => (j === idx ? { ...x, ...updates } : x)));
  };
  const deleteAccount = async (idx: number) => {
    const acc = accounts[idx];
    if (!acc?.id || !confirm("确定删除该账号？")) return;
    await fetch(`/api/planning/accounts/${acc.id}`, { method: "DELETE" });
    setAccounts((a) => a.filter((_, j) => j !== idx));
  };

  const saveStrategyOnly = async () => {
    await savePlan({
      theme: theme.trim() || null,
      hooks: hooks.filter((h) => h.name.trim() || h.description.trim()),
      strategy_notes: strategyNotes.trim() || null,
    });
    router.push("/planning");
  };

  const confirmAndSchedule = async () => {
    await savePlan({
      theme: theme.trim() || null,
      hooks: hooks.filter((h) => h.name.trim() || h.description.trim()),
      strategy_notes: strategyNotes.trim() || null,
    });
    router.push(`/planning/${planId}/schedule`);
  };

  if (loading || !plan) return <div className="py-12 text-center text-sm text-[#78716C]">加载中…</div>;

  return (
    <>
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => savePlan({ theme, hooks, strategy_notes: strategyNotes })}
          disabled={saving}
          className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h3 className="text-base font-semibold text-[#1C1917] mb-4">主题与钩子</h3>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="输入统一主题，如：组团租房、通勤便利"
            className="flex-1 h-9 rounded-lg border border-[#E7E5E4] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
          <button type="button" onClick={aiThemes} disabled={loadingThemes} className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm text-[#78716C] hover:bg-[#F5F5F4]">
            {loadingThemes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 推荐
          </button>
        </div>
        <div className="space-y-2">
          {hooks.map((h, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input value={h.name} onChange={(e) => updateHook(i, "name", e.target.value)} placeholder="钩子名称" className="w-32 h-9 rounded-lg border border-[#E7E5E4] px-2 text-sm" />
              <input value={h.description} onChange={(e) => updateHook(i, "description", e.target.value)} placeholder="描述" className="flex-1 h-9 rounded-lg border border-[#E7E5E4] px-2 text-sm" />
              <select value={h.driver} onChange={(e) => updateHook(i, "driver", e.target.value)} className="w-28 h-9 rounded-lg border border-[#E7E5E4] px-2 text-sm">
                {DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button type="button" onClick={() => removeHook(i)} disabled={hooks.length <= 1} className="p-2 text-[#A8A29E] hover:text-red-500 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={addHook} className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4]"><Plus className="h-4 w-4" /> 添加钩子</button>
          <button type="button" onClick={aiHooks} disabled={loadingHooks || !theme.trim()} className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4]">
            {loadingHooks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 拆钩子
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h3 className="text-base font-semibold text-[#1C1917] mb-4">账号与人格</h3>
        <div className="space-y-3">
          {accounts.map((acc, i) => {
            const currentGlobal = globalAccounts.find((g) => g.name === acc.account_name) ?? null;
            return (
              <div key={acc.id || i} className="rounded-lg border border-[#E7E5E4] p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={currentGlobal?.id ?? ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      const g = globalAccounts.find((x) => x.id === id);
                      if (g) updateAccount(i, { account_name: g.name, color: g.color ?? COLORS[0] });
                    }}
                    className="w-32 h-9 rounded-lg border border-[#E7E5E4] px-2 text-sm"
                  >
                    <option value="">选择账号</option>
                    {globalAccounts.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={acc.hook_index}
                    onChange={(e) => updateAccount(i, { hook_index: Number(e.target.value) })}
                    className="w-28 h-9 rounded-lg border border-[#E7E5E4] px-2 text-sm"
                  >
                    <option value={-1}>选择钩子</option>
                    {hooks
                      .filter((h) => h.name.trim())
                      .map((h, j) => (
                        <option key={j} value={j}>
                          {h.name}
                        </option>
                      ))}
                  </select>
                  <select
                    value={acc.persona_doc_id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const doc = personaDocs.find((d) => d.id === v);
                      updateAccount(i, { persona_doc_id: v || null, persona_name: doc?.title ?? null });
                    }}
                    className="w-36 h-9 rounded-lg border border-[#E7E5E4] px-2 text-sm"
                  >
                    <option value="">选择人格</option>
                    {personaDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateAccount(i, { color: c })}
                        className={cn("w-6 h-6 rounded-full border-2", acc.color === c ? "border-[#1C1917]" : "border-transparent")}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAccount(i)}
                    className="p-2 text-[#A8A29E] hover:text-red-500"
                    aria-label="删除账号"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="pl-0">
                  <input
                    value={acc.positioning ?? ""}
                    onChange={(e) => updateAccount(i, { positioning: e.target.value })}
                    placeholder="一句话定位"
                    className="w-full min-w-[120px] h-9 rounded-lg border border-[#E7E5E4] px-2 text-sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => addAccount()} className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4]"><Plus className="h-4 w-4" /> 添加账号</button>
          <button type="button" onClick={aiAccounts} disabled={loadingAccounts} className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4]">
            {loadingAccounts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 自动分配
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
        <h3 className="text-base font-semibold text-[#1C1917] mb-4">策略总结</h3>
        <textarea value={strategyNotes} onChange={(e) => setStrategyNotes(e.target.value)} rows={6} placeholder="AI 生成或手动填写策略说明" className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={aiSummary} disabled={loadingSummary} className="flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4]">
            {loadingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 生成总结
          </button>
        </div>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={saveStrategyOnly} disabled={saving} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C] hover:bg-[#F5F5F4]">仅保存策略</button>
          <button type="button" onClick={confirmAndSchedule} disabled={saving} className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white">确认策略，进入排期 →</button>
        </div>
      </div>
    </div>
    </>
  );
}
