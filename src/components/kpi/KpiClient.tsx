"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, DollarSign, Leaf, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotesTab } from "./NotesTab";
import { PaidTab } from "./PaidTab";
import { NaturalTab } from "./NaturalTab";
import { UploadModal } from "./UploadModal";
import { AddAccountModal, type GlobalAccount } from "@/components/planning/AddAccountModal";

const TABS = [
  { key: "notes", label: "全量笔记", icon: BarChart3 },
  { key: "paid", label: "投放效果", icon: DollarSign },
  { key: "natural", label: "自然流量估算", icon: Leaf },
] as const;

export type KpiFilters = {
  from_date: string;
  to_date: string;
  account_names: string[];
};

export function KpiClient() {
  const [tab, setTab] = useState<"notes" | "paid" | "natural">("notes");
  const [filters, setFilters] = useState<KpiFilters>({
    from_date: "",
    to_date: "",
    account_names: [],
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notesRefreshToken, setNotesRefreshToken] = useState(0);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);
  const [compareInfo, setCompareInfo] = useState<{
    start_date: string | null;
    end_date: string | null;
    no_comparison: boolean;
  } | null>(null);
  const [accounts, setAccounts] = useState<GlobalAccount[]>([]);
  const [notesAddAccountOpen, setNotesAddAccountOpen] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const firstDay = new Date();
    firstDay.setDate(1);
    const monthStart = firstDay.toISOString().slice(0, 10);
    setFilters((prev) => ({
      ...prev,
      from_date: prev.from_date || monthStart,
      to_date: prev.to_date || today,
    }));
  }, []);
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((a: GlobalAccount[]) => setAccounts(Array.isArray(a) ? a : []));
  }, []);

  useEffect(() => {
    if (!filters.from_date || !filters.to_date) return;
    const loadCompareInfo = async () => {
      const params = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
      });
      filters.account_names.forEach((name) => params.append("account", name));
      const res = await fetch(`/api/kpi/notes-comparison?${params}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && !data.error) {
        setCompareInfo({
          start_date: data.start_date ?? null,
          end_date: data.end_date ?? null,
          no_comparison: !!data.no_comparison,
        });
      } else {
        setCompareInfo(null);
      }
    };
    loadCompareInfo();
  }, [filters.from_date, filters.to_date, filters.account_names, notesRefreshToken]);

  const inputCls =
    "h-9 rounded-lg border border-[#E7E5E4] bg-white px-3 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20";

  const triggerNotesRefresh = useCallback(
    (reason: string, uploadedSnapshotDate?: string) => {
      setNotesRefreshToken((prev) => {
        const next = prev + 1;
        console.log("[KpiClient] 触发全量笔记刷新:", {
          reason,
          uploaded_snapshot_date: uploadedSnapshotDate ?? null,
          prev_token: prev,
          next_token: next,
        });
        setRefreshToast(`已触发全量笔记刷新 #${next}`);
        window.setTimeout(() => setRefreshToast(null), 2200);
        return next;
      });
    },
    []
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[#78716C]">日期范围</span>
          <input
            type="date"
            value={filters.from_date}
            onChange={(e) =>
              setFilters((p) => ({ ...p, from_date: e.target.value }))
            }
            className={inputCls}
          />
          <span className="text-[#A8A29E]">→</span>
          <input
            type="date"
            value={filters.to_date}
            onChange={(e) =>
              setFilters((p) => ({ ...p, to_date: e.target.value }))
            }
            className={inputCls}
          />
          {tab === "notes" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#78716C]">账号</span>
              <select
                multiple
                value={filters.account_names}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                  setFilters((p) => ({ ...p, account_names: selected }));
                }}
                className={cn(inputCls, "min-w-[140px] max-w-[220px] py-1.5")}
                title="按住 Ctrl/Cmd 多选"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
              {filters.account_names.length > 0 && (
                <span className="text-xs text-[#78716C]">已选 {filters.account_names.length}</span>
              )}
              <button
                type="button"
                onClick={() => setNotesAddAccountOpen(true)}
                className="text-xs text-blue-600 hover:underline"
              >
                + 新增账号
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#FAFAF9]"
        >
          <Upload className="h-4 w-4" /> 上传数据
        </button>
      </div>

      <div className="mb-3 text-xs text-[#78716C]">
        {compareInfo?.start_date && compareInfo?.end_date
          ? `对比：${compareInfo.start_date} → ${compareInfo.end_date}${compareInfo.no_comparison ? "（暂无对比数据）" : ""}`
          : "对比：暂无可用快照"}
      </div>

      <div className="mb-6 flex gap-1 border-b border-[#E7E5E4]">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-[#1C1917] text-[#1C1917]"
                  : "border-transparent text-[#78716C] hover:text-[#1C1917]"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "notes" && (
        <NotesTab filters={filters} refreshToken={notesRefreshToken} />
      )}
      {tab === "paid" && <PaidTab filters={filters} />}
      {tab === "natural" && <NaturalTab filters={filters} />}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSuccess={(uploadedSnapshotDate) => {
            setUploadOpen(false);
            // 即使快照日期没变化（同一天重复上传），也强制触发 NotesTab 重拉数据
            triggerNotesRefresh("upload-success", uploadedSnapshotDate);
          }}
        />
      )}

      {refreshToast && (
        <div className="fixed right-4 top-4 z-[60] rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs text-[#1C1917] shadow-card">
          {refreshToast}
        </div>
      )}
      {notesAddAccountOpen && (
        <AddAccountModal
          onClose={() => setNotesAddAccountOpen(false)}
          onSuccess={() => {
            fetch("/api/accounts")
              .then((r) => r.json())
              .then((a: GlobalAccount[]) => setAccounts(Array.isArray(a) ? a : []));
            setNotesAddAccountOpen(false);
          }}
        />
      )}
    </div>
  );
}
