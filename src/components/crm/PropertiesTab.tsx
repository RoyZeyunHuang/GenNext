"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, MapPin, Building2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Company = { id: string; name: string };
type PropertyCompany = { id: string; role: string; company_id: string; companies: Company | null };
type Property = {
  id: string; name: string; address: string | null; city: string | null;
  area: string | null; price_range: string | null; units: number | null;
  build_year: number | null; property_companies: PropertyCompany[];
};

const AREAS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

export function PropertiesTab() {
  const [list, setList] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Property | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchList = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (selectedAreas.size > 0) params.set("areas", Array.from(selectedAreas).join(","));
    const res = await fetch(`/api/crm/properties?${params}`);
    const data = await res.json().catch(() => []);
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search, selectedAreas]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const toggleArea = (a: string) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  };

  const handleCreate = async (form: Record<string, string | number | null>) => {
    const res = await fetch("/api/crm/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      fetchList();
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!window.confirm("确定要删除该楼盘吗？其关联公司与跟进记录将一并删除，且不可恢复。")) return;
    const res = await fetch(`/api/crm/properties/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected(null);
      fetchList();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "删除失败");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-[#1C1917]">楼盘列表</span>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90"
          >
            <Plus className="h-3.5 w-3.5" /> 新增楼盘
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#78716C]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索楼盘..."
            className="w-full rounded-lg border border-[#E7E5E4] bg-white py-2 pl-8 pr-3 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => toggleArea(a)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                selectedAreas.has(a)
                  ? "border-[#1C1917] bg-[#1C1917] text-white"
                  : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]"
              )}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-[#78716C]">加载中…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#78716C]">暂无楼盘</p>
          ) : (
            list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  selected?.id === p.id
                    ? "border-[#1C1917] bg-[#FAFAF9]"
                    : "border-[#E7E5E4] bg-white hover:bg-[#FAFAF9]"
                )}
              >
                <div className="text-sm font-medium text-[#1C1917]">{p.name}</div>
                {p.address && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-[#78716C]">
                    <MapPin className="h-3 w-3" /> {p.address}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs text-[#78716C]">
                  {p.area && <span className="rounded bg-[#F5F5F4] px-1.5 py-0.5">{p.area}</span>}
                  <span className="flex items-center gap-0.5">
                    <Building2 className="h-3 w-3" /> {p.property_companies?.length ?? 0} 家公司
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="rounded-lg bg-white p-6 shadow-card">
        {selected ? (
          <PropertyDetail property={selected} onDelete={() => handleDeleteProperty(selected.id)} />
        ) : showForm ? (
          <PropertyForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
        ) : (
          <p className="py-20 text-center text-sm text-[#78716C]">选择左侧楼盘查看详情，或点击「新增楼盘」</p>
        )}
      </div>
    </div>
  );
}

function PropertyDetail({ property: p, onDelete }: { property: Property; onDelete: () => void }) {
  const roles: Record<string, PropertyCompany[]> = {};
  (p.property_companies ?? []).forEach((pc) => {
    (roles[pc.role] = roles[pc.role] || []).push(pc);
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[#1C1917]">{p.name}</h3>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-[#FEE2E2] px-3 py-1 text-xs text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-1"
          title="删除楼盘"
        >
          <Trash2 className="h-3.5 w-3.5" /> 删除
        </button>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-[#78716C]">
        {p.address && <div>地址：{p.address}</div>}
        {p.area && <div>区域：{p.area}</div>}
        {p.price_range && <div>价格范围：{p.price_range}</div>}
        {p.units != null && <div>户数：{p.units}</div>}
        {p.build_year != null && <div>建成年份：{p.build_year}</div>}
      </div>
      {Object.keys(roles).length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-[#1C1917]">关联公司</h4>
          {Object.entries(roles).map(([role, pcs]) => (
            <div key={role} className="mb-2">
              <span className="text-xs font-medium uppercase text-[#78716C]">{role}</span>
              <div className="mt-1 space-y-1">
                {pcs.map((pc) => (
                  <div key={pc.id} className="rounded border border-[#E7E5E4] bg-[#FAFAF9] px-2 py-1 text-sm text-[#1C1917]">
                    {pc.companies?.name ?? "未知公司"}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyForm({ onSubmit, onClose }: { onSubmit: (f: Record<string, string | number | null>) => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", address: "", area: "", price_range: "", units: "", build_year: "" });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#1C1917]">新增楼盘</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="楼盘名称 *" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="地址" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <select value={form.area} onChange={(e) => set("area", e.target.value)} className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20">
          <option value="">选择区域</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={form.price_range} onChange={(e) => set("price_range", e.target.value)} placeholder="价格范围" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <input value={form.units} onChange={(e) => set("units", e.target.value)} placeholder="户数" type="number" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <input value={form.build_year} onChange={(e) => set("build_year", e.target.value)} placeholder="建成年份" type="number" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <button
          type="button"
          disabled={!form.name.trim()}
          onClick={() =>
            onSubmit({
              name: form.name.trim(),
              address: form.address || null,
              area: form.area || null,
              price_range: form.price_range || null,
              units: form.units ? parseInt(form.units) : null,
              build_year: form.build_year ? parseInt(form.build_year) : null,
            })
          }
          className="rounded-lg bg-[#1C1917] py-2 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
        >
          保存
        </button>
      </div>
    </div>
  );
}
