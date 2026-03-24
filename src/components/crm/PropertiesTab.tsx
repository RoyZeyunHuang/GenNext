"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, MapPin, Building2, Trash2, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const AREA_MAP: Record<string, string[]> = {
  Manhattan: ["Midtown", "Upper East Side", "Upper West Side", "Harlem", "East Harlem", "Washington Heights", "Inwood", "Marble Hill", "FiDi", "Tribeca", "SoHo", "NoHo", "East Village", "West Village", "Greenwich Village", "Chelsea", "Hells Kitchen", "Murray Hill", "Gramercy", "Flatiron", "NoMad", "Kips Bay", "Stuyvesant Town", "Lower East Side", "Chinatown", "Battery Park City", "Hudson Yards", "Morningside Heights", "Hamilton Heights", "Sugar Hill"],
  Brooklyn: ["Williamsburg", "DUMBO", "Downtown Brooklyn", "Brooklyn Heights", "Park Slope", "Prospect Heights", "Fort Greene", "Clinton Hill", "Bed-Stuy", "Bushwick", "Greenpoint", "Cobble Hill", "Boerum Hill", "Carroll Gardens", "Red Hook", "Sunset Park", "Bay Ridge", "Flatbush", "Crown Heights", "Prospect Lefferts Gardens", "Gowanus"],
  Queens: ["LIC", "Long Island City", "Astoria", "Jackson Heights", "Flushing", "Forest Hills", "Rego Park", "Sunnyside", "Woodside", "Elmhurst", "Jamaica", "Bayside", "Fresh Meadows", "Ridgewood"],
  Bronx: ["South Bronx", "Mott Haven", "Fordham", "Riverdale", "Kingsbridge", "Pelham Bay", "Throgs Neck", "Morris Heights"],
  "Staten Island": ["St. George", "Stapleton", "Todt Hill"],
  "Jersey City": ["Journal Square", "Newport", "Downtown JC", "The Waterfront", "Paulus Hook", "Hamilton Park", "Bergen-Lafayette"],
  Hoboken: ["Hoboken"],
  "Other NJ": ["Weehawken", "Union City", "West New York", "Edgewater", "Fort Lee"],
};

const REGIONS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Jersey City", "Hoboken", "Other NJ", "其他", "全部"];

function getRegionForArea(area: string | null): string {
  if (!area) return "其他";
  for (const [region, subAreas] of Object.entries(AREA_MAP)) {
    if (subAreas.includes(area)) return region;
  }
  return "其他";
}

const OUTREACH_STAGE_MAP: Record<string, string> = {
  "Not Started": "未开始",
  "Email Pitched": "Email Pitched",
  Pitched: "已发方案",
  Meeting: "已约见面",
  Negotiating: "谈判中",
  Won: "已签约",
  Lost: "未成功",
};
const OUTREACH_STAGE_CARD_COLOR: Record<string, string> = {
  "Not Started": "bg-[#E7E5E4] text-[#44403C]",
  "Email Pitched": "bg-indigo-100 text-indigo-800",
  Pitched: "bg-blue-100 text-blue-800",
  Meeting: "bg-amber-100 text-amber-800",
  Negotiating: "bg-orange-100 text-orange-800",
  Won: "bg-emerald-100 text-emerald-800",
  Lost: "bg-red-100 text-red-800",
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "邮件",
  phone: "电话",
  wechat: "微信",
  meeting: "面谈",
};

type Company = { id: string; name: string; type?: string | null; contacts?: Contact[] };
type Contact = { id: string; company_id: string; name: string; title: string | null; phone: string | null; email: string | null };
type PropertyCompany = { id: string; role: string; company_id: string; companies: Company | null };
type Property = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  area: string | null;
  price_range: string | null;
  units: number | null;
  build_year: number | null;
  property_companies: PropertyCompany[];
};
const PROPERTY_COMPANY_ROLES = ["developer", "management", "leasing", "marketing"] as const;
const PROPERTY_COMPANY_ROLE_LABELS: Record<string, string> = { developer: "DEVELOPER", management: "MANAGEMENT", leasing: "LEASING", marketing: "MARKETING" };
type OutreachRow = {
  id: string;
  property_id: string;
  stage?: string;
  status?: string;
  deal_status?: string;
  price?: string | null;
  term?: string | null;
};
type LogRow = { id: string; date: string; channel: string | null; content: string | null; next_action: string | null; created_at: string | null };

export function PropertiesTab() {
  const [list, setList] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string | null>("全部");
  const [selectedSubAreas, setSelectedSubAreas] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Property | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [outreachByProperty, setOutreachByProperty] = useState<Record<string, OutreachRow>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (selectedRegion === "全部" || !selectedRegion) {
      // no area filter
    } else if (selectedRegion === "其他") {
      params.set("other_only", "1");
    } else {
      const subAreas = selectedSubAreas.size > 0 ? Array.from(selectedSubAreas) : AREA_MAP[selectedRegion] ?? [];
      if (subAreas.length > 0) params.set("areas", subAreas.join(","));
    }
    const res = await fetch(`/api/crm/properties?${params}`);
    const data = await res.json().catch(() => []);
    const newList = Array.isArray(data) ? data : [];
    setList(newList);
    setSelected((prev) => (prev ? (newList.find((x: Property) => x.id === prev.id) ?? prev) : null));
    setLoading(false);
  }, [search, selectedRegion, selectedSubAreas]);

  const refetchListAndKeepSelection = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (selectedRegion === "全部" || !selectedRegion) {
    } else if (selectedRegion === "其他") {
      params.set("other_only", "1");
    } else {
      const subAreas = selectedSubAreas.size > 0 ? Array.from(selectedSubAreas) : AREA_MAP[selectedRegion] ?? [];
      if (subAreas.length > 0) params.set("areas", subAreas.join(","));
    }
    const res = await fetch(`/api/crm/properties?${params}`);
    const data = await res.json().catch(() => []);
    const newList = Array.isArray(data) ? data : [];
    setList(newList);
    setSelected((prev) => (prev ? (newList.find((x: Property) => x.id === prev.id) ?? prev) : null));
    setLoading(false);
  }, [search, selectedRegion, selectedSubAreas]);

  const fetchOutreach = useCallback(async () => {
    const res = await fetch("/api/crm/outreach");
    const data = await res.json().catch(() => []);
    const arr = Array.isArray(data) ? data : [];
    const map: Record<string, OutreachRow> = {};
    arr.forEach((o: Record<string, unknown>) => {
      const stage = (o.stage ?? o.status) as string;
      map[o.property_id as string] = {
        id: o.id as string,
        property_id: o.property_id as string,
        stage,
        status: stage,
        deal_status: (o.deal_status as string) ?? "Active",
        price: (o.price as string | null) ?? null,
        term: (o.term as string | null) ?? null,
      };
    });
    setOutreachByProperty(map);
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchOutreach();
  }, [fetchOutreach]);

  const toggleSubArea = (a: string) => {
    setSelectedSubAreas((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
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
      setOutreachByProperty((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "删除失败");
    }
  };

  const subAreaOptions = selectedRegion && selectedRegion !== "全部" && selectedRegion !== "其他" ? AREA_MAP[selectedRegion] ?? [] : [];

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
        <div className="mb-2 text-xs font-medium text-[#78716C]">大区</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setSelectedRegion(r === "全部" ? null : r);
                setSelectedSubAreas(new Set());
              }}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                (r === "全部" && !selectedRegion) || selectedRegion === r
                  ? "border-[#1C1917] bg-[#1C1917] text-white"
                  : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        {subAreaOptions.length > 0 && (
          <>
            <div className="mb-2 text-xs font-medium text-[#78716C]">小区（可多选）</div>
            <div className="mb-3 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {subAreaOptions.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleSubArea(a)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    selectedSubAreas.has(a)
                      ? "border-[#1C1917] bg-[#1C1917] text-white"
                      : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="max-h-[440px] space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-[#78716C]">加载中…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#78716C]">暂无楼盘</p>
          ) : (
            list.map((p) => {
              const outreach = outreachByProperty[p.id];
              const stage = outreach?.stage ?? outreach?.status;
              const statusLabel = outreach && stage && stage !== "Not Started" ? OUTREACH_STAGE_MAP[stage] : null;
              const statusColor = outreach && stage ? OUTREACH_STAGE_CARD_COLOR[stage] : "";
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    selected?.id === p.id ? "border-[#1C1917] bg-[#FAFAF9]" : "border-[#E7E5E4] bg-white hover:bg-[#FAFAF9]"
                  )}
                >
                  <div className="text-sm font-medium text-[#1C1917]">{p.name}</div>
                  {statusLabel && (
                    <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", statusColor)}>
                      {statusLabel}
                    </span>
                  )}
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
              );
            })
          )}
        </div>
      </div>
      <div className="rounded-lg bg-white p-6 shadow-card">
        {selected ? (
          <PropertyDetail
            property={selected}
            onDelete={() => handleDeleteProperty(selected.id)}
            onRefresh={refetchListAndKeepSelection}
          />
        ) : showForm ? (
          <PropertyForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
        ) : (
          <p className="py-20 text-center text-sm text-[#78716C]">选择左侧楼盘查看详情，或点击「新增楼盘」</p>
        )}
      </div>
    </div>
  );
}

type DetailProperty = Property & { property_companies: (PropertyCompany & { companies: Company | null })[] };
type EditCompanyRow = { id?: string; company_id: string; role: string };
type EditContactRow = { id?: string; company_id: string; name: string; title: string; phone: string; email: string };

function PropertyDetail({
  property: p,
  onDelete,
  onRefresh,
}: {
  property: Property;
  onDelete: () => void;
  onRefresh?: () => void | Promise<void>;
}) {
  const [detail, setDetail] = useState<DetailProperty | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const [editForm, setEditForm] = useState<{
    name: string;
    address: string;
    region: string;
    area: string;
    price_range: string;
    units: string;
    build_year: string;
    propertyCompanies: EditCompanyRow[];
    contacts: EditContactRow[];
  } | null>(null);
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [companiesSearch, setCompaniesSearch] = useState("");

  const display = (detail ?? p) as DetailProperty;
  const region = getRegionForArea(display.area);

  useEffect(() => {
    if (!p.id) return;
    setDetailLoading(true);
    fetch(`/api/crm/properties/${p.id}`)
      .then((r) => r.json())
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
      })
      .catch(() => setDetailLoading(false));
  }, [p.id]);

  const startEditing = useCallback(() => {
    const d = (detail ?? p) as DetailProperty;
    const region = getRegionForArea(d.area);
    const subAreaOptions = region && region !== "其他" ? AREA_MAP[region] ?? [] : [];
    const areaValue = d.area && subAreaOptions.includes(d.area) ? d.area : region === "其他" ? d.area ?? "" : d.area ?? "";
    setEditForm({
      name: d.name ?? "",
      address: d.address ?? "",
      region: region ?? "",
      area: areaValue,
      price_range: d.price_range ?? "",
      units: d.units != null ? String(d.units) : "",
      build_year: d.build_year != null ? String(d.build_year) : "",
      propertyCompanies: (d.property_companies ?? []).map((pc) => ({ id: pc.id, company_id: pc.company_id, role: pc.role })),
      contacts: (d.property_companies ?? []).flatMap((pc) =>
        (pc.companies?.contacts ?? []).map((c) => ({
          id: c.id,
          company_id: pc.company_id,
          name: c.name ?? "",
          title: c.title ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
        }))
      ),
    });
    setIsEditing(true);
    fetch("/api/crm/companies")
      .then((r) => r.json())
      .then((data) => setCompaniesList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [detail, p]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditForm(null);
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editForm || !p.id) return;
    const areaValue = editForm.area;
    try {
      const putRes = await fetch(`/api/crm/properties/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name?.trim() || "未命名楼盘",
          address: editForm.address || null,
          area: areaValue || null,
          price_range: editForm.price_range || null,
          units: editForm.units === "" ? null : parseInt(editForm.units, 10),
          build_year: editForm.build_year === "" ? null : parseInt(editForm.build_year, 10),
        }),
      });
      if (!putRes.ok) throw new Error("更新楼盘失败");

      const d = (detail ?? p) as DetailProperty;
      const nextPcs = editForm.propertyCompanies.filter((r) => r.company_id);
      const nextPcKey = (r: EditCompanyRow) => `${r.company_id}:${r.role}`;
      const prevByKey = new Map((d.property_companies ?? []).map((pc) => [`${pc.company_id}:${pc.role}`, pc]));

      for (const row of nextPcs) {
        const key = nextPcKey(row);
        const prev = prevByKey.get(key);
        if (!prev) {
          await fetch("/api/crm/property-companies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ property_id: p.id, company_id: row.company_id, role: row.role }),
          });
        }
      }
      for (const pc of d.property_companies ?? []) {
        const key = `${pc.company_id}:${pc.role}`;
        const still = nextPcs.some((r) => nextPcKey(r) === key);
        if (!still) {
          await fetch(`/api/crm/property-companies/${pc.id}`, { method: "DELETE" });
        }
      }

      const prevContacts = (d.property_companies ?? []).flatMap((pc) => pc.companies?.contacts ?? []);
      const prevById = new Map(prevContacts.map((c) => [c.id, c]));
      for (const row of editForm.contacts) {
        if (!row.company_id) continue;
        const payload = { name: row.name || "未命名", title: row.title || null, phone: row.phone || null, email: row.email || null };
        if (row.id) {
          const prev = prevById.get(row.id);
          if (prev && (prev.name !== row.name || prev.title !== row.title || prev.phone !== row.phone || prev.email !== row.email)) {
            await fetch(`/api/crm/contacts/${row.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }
        } else {
          await fetch(`/api/crm/companies/${row.company_id}/contacts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
      }
      const nextIds = new Set(editForm.contacts.filter((r) => r.id).map((r) => r.id!));
      for (const c of prevContacts) {
        if (!nextIds.has(c.id)) await fetch(`/api/crm/contacts/${c.id}`, { method: "DELETE" });
      }

      const refetch = await fetch(`/api/crm/properties/${p.id}`);
      const updated = await refetch.json();
      setDetail(updated);
      setIsEditing(false);
      setEditForm(null);
      setToast("已保存");
      setTimeout(() => setToast(null), 2000);
      await onRefresh?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    }
  }, [editForm, p.id, detail, onRefresh]);

  const fetchLogs = useCallback(async () => {
    if (!p.id) return;
    setLogLoading(true);
    const res = await fetch(`/api/crm/communication-logs?property_id=${encodeURIComponent(p.id)}`);
    const data = await res.json().catch(() => []);
    setLogs(Array.isArray(data) ? data : []);
    setLogLoading(false);
  }, [p.id]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (detailLoading && !detail) {
    return (
      <div className="py-12 text-center text-sm text-[#78716C]">加载详情中…</div>
    );
  }

  return (
    <div>
      {toast && (
        <div className="mb-3 rounded-lg bg-[#1C1917] px-3 py-2 text-center text-sm text-white">{toast}</div>
      )}
      <div className="flex items-center justify-between gap-2">
        {!isEditing ? (
          <>
            <h3 className="text-xl font-semibold text-[#1C1917]">{display.name}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-xs text-[#1C1917] hover:bg-[#F5F5F4]"
                title="编辑"
              >
                <Pencil className="h-3.5 w-3.5" /> 编辑
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1 rounded-lg border border-[#FEE2E2] px-3 py-1.5 text-xs text-[#DC2626] hover:bg-[#FEF2F2]"
                title="删除楼盘"
              >
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveEditing}
              className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs text-white hover:bg-[#1C1917]/90"
            >
              <Check className="h-3.5 w-3.5" /> 保存
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {!isEditing ? (
        <div className="mt-3 grid gap-2 text-sm text-[#78716C]">
          {display.address && <div>地址：{display.address}</div>}
          {display.area && (
            <div>区域：{region !== "其他" ? `${region} → ${display.area}` : display.area}</div>
          )}
          {display.price_range && <div>价格范围：{display.price_range}</div>}
          {display.units != null && <div>户数：{display.units}</div>}
          {display.build_year != null && <div>建成年份：{display.build_year}</div>}
        </div>
      ) : editForm ? (
        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[#78716C]">楼盘名</span>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
              className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[#78716C]">地址</span>
            <input
              value={editForm.address}
              onChange={(e) => setEditForm((f) => (f ? { ...f, address: e.target.value } : f))}
              className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-[#78716C]">大区</span>
              <select
                value={editForm.region}
                onChange={(e) => setEditForm((f) => (f ? { ...f, region: e.target.value, area: "" } : f))}
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
              >
                <option value="">选择大区</option>
                {REGIONS.filter((r) => r !== "全部").map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[#78716C]">{editForm.region === "其他" ? "区域" : "小区"}</span>
              {editForm.region === "其他" ? (
                <input
                  value={editForm.area}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, area: e.target.value } : f))}
                  placeholder="输入区域"
                  className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
                />
              ) : (
                <select
                  value={editForm.area}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, area: e.target.value } : f))}
                  className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
                >
                  <option value="">选择小区</option>
                  {(editForm.region ? AREA_MAP[editForm.region] ?? [] : []).map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-[#78716C]">价格范围</span>
            <input
              value={editForm.price_range}
              onChange={(e) => setEditForm((f) => (f ? { ...f, price_range: e.target.value } : f))}
              placeholder="$3,220-$4,750"
              className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-[#78716C]">户数</span>
              <input
                type="number"
                value={editForm.units}
                onChange={(e) => setEditForm((f) => (f ? { ...f, units: e.target.value } : f))}
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[#78716C]">建成年份</span>
              <input
                type="number"
                value={editForm.build_year}
                onChange={(e) => setEditForm((f) => (f ? { ...f, build_year: e.target.value } : f))}
                className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="border-t border-[#E7E5E4] pt-4">
            <h4 className="mb-2 text-sm font-medium text-[#1C1917]">关联公司</h4>
            <div className="mb-2 flex items-center gap-2">
              <input
                type="text"
                value={companiesSearch}
                onChange={(e) => setCompaniesSearch(e.target.value)}
                placeholder="搜索公司"
                className="max-w-[180px] rounded-lg border border-[#E7E5E4] px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  const name = window.prompt("新建公司名称");
                  if (!name?.trim()) return;
                  const res = await fetch("/api/crm/companies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim() }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setCompaniesList((prev) => [...prev, data]);
                  }
                }}
                className="text-xs text-[#1C1917] hover:underline"
              >
                ＋ 新建公司
              </button>
            </div>
            <div className="space-y-2">
              {editForm.propertyCompanies.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    value={row.role}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, propertyCompanies: f.propertyCompanies.map((r, i) => (i === idx ? { ...r, role: e.target.value } : r)) } : f
                      )
                    }
                    className="rounded-lg border border-[#E7E5E4] px-2 py-1.5 text-xs"
                  >
                    {PROPERTY_COMPANY_ROLES.map((r) => (
                      <option key={r} value={r}>{PROPERTY_COMPANY_ROLE_LABELS[r] ?? r}</option>
                    ))}
                  </select>
                  <select
                    value={row.company_id}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, propertyCompanies: f.propertyCompanies.map((r, i) => (i === idx ? { ...r, company_id: e.target.value } : r)) } : f
                      )
                    }
                    className="min-w-[140px] rounded-lg border border-[#E7E5E4] px-2 py-1.5 text-xs"
                  >
                    <option value="">选择公司</option>
                    {companiesList
                      .filter((c) => !companiesSearch || c.name.toLowerCase().includes(companiesSearch.toLowerCase()))
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((f) =>
                        f ? { ...f, propertyCompanies: f.propertyCompanies.filter((_, i) => i !== idx) } : f
                      )
                    }
                    className="rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                    title="删除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setEditForm((f) =>
                  f ? { ...f, propertyCompanies: [...f.propertyCompanies, { company_id: "", role: "developer" }] } : f
                )
              }
              className="mt-2 flex items-center gap-1 text-xs text-[#1C1917] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> 添加关联公司
            </button>
          </div>
          <div className="border-t border-[#E7E5E4] pt-4">
            <h4 className="mb-2 text-sm font-medium text-[#1C1917]">联系人</h4>
            <div className="space-y-2">
              {editForm.contacts.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E7E5E4] p-2">
                  <select
                    value={row.company_id}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, contacts: f.contacts.map((r, i) => (i === idx ? { ...r, company_id: e.target.value } : r)) } : f
                      )
                    }
                    className="rounded border border-[#E7E5E4] px-2 py-1 text-xs"
                  >
                    <option value="">选择公司</option>
                    {editForm.propertyCompanies
                      .filter((r) => r.company_id)
                      .map((r) => {
                        const c = companiesList.find((x) => x.id === r.company_id);
                        return c ? <option key={c.id} value={c.id}>{c.name}</option> : null;
                      })
                      .filter(Boolean)}
                  </select>
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, contacts: f.contacts.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)) } : f
                      )
                    }
                    placeholder="姓名"
                    className="w-24 rounded border border-[#E7E5E4] px-2 py-1 text-xs"
                  />
                  <input
                    value={row.title}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, contacts: f.contacts.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)) } : f
                      )
                    }
                    placeholder="职位"
                    className="w-20 rounded border border-[#E7E5E4] px-2 py-1 text-xs"
                  />
                  <input
                    value={row.phone}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, contacts: f.contacts.map((r, i) => (i === idx ? { ...r, phone: e.target.value } : r)) } : f
                      )
                    }
                    placeholder="电话"
                    className="w-24 rounded border border-[#E7E5E4] px-2 py-1 text-xs"
                  />
                  <input
                    value={row.email}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, contacts: f.contacts.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)) } : f
                      )
                    }
                    placeholder="邮箱"
                    className="w-28 rounded border border-[#E7E5E4] px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((f) => (f ? { ...f, contacts: f.contacts.filter((_, i) => i !== idx) } : f))
                    }
                    className="rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                    title="删除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const firstCompanyId = editForm.propertyCompanies.find((r) => r.company_id)?.company_id ?? "";
                setEditForm((f) =>
                  f ? { ...f, contacts: [...f.contacts, { company_id: firstCompanyId, name: "", title: "", phone: "", email: "" }] } : f
                );
              }}
              className="mt-2 flex items-center gap-1 text-xs text-[#1C1917] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> 添加联系人
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 border-t border-[#E7E5E4] pt-4">
        <h4 className="mb-3 text-sm font-medium text-[#1C1917]">沟通记录</h4>
        {logLoading ? (
          <p className="py-4 text-center text-xs text-[#78716C]">加载中…</p>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-xs text-[#78716C]">暂无记录</p>
        ) : (
          <div className="mb-4 space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="group flex items-start justify-between gap-2 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-[#78716C]">
                    <span>{log.date}</span>
                    {log.channel && (
                      <span className="rounded bg-[#E7E5E4] px-1.5 py-0.5">{CHANNEL_LABELS[log.channel] ?? log.channel}</span>
                    )}
                  </div>
                  {log.content && <p className="text-[#1C1917]">{log.content}</p>}
                  {log.next_action && <p className="mt-1 text-xs text-[#78716C]">下一步：{log.next_action}</p>}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch(`/api/crm/communication-logs/${log.id}`, { method: "DELETE" });
                    if (res.ok) fetchLogs();
                  }}
                  className="shrink-0 rounded p-1 text-[#78716C] opacity-0 transition-opacity hover:bg-[#FEE2E2] hover:text-[#DC2626] group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="mt-6 border-t border-[#E7E5E4] pt-4">
          <h4 className="mb-3 text-sm font-medium text-[#1C1917]">公司与联系人</h4>
          {(display.property_companies ?? []).length === 0 ? (
            <p className="text-sm text-[#78716C]">暂无关联公司</p>
          ) : (
            <div className="space-y-4">
              {(display.property_companies ?? []).map((pc) => {
                const contacts = pc.companies?.contacts ?? [];
                const roleLabel =
                  PROPERTY_COMPANY_ROLE_LABELS[pc.role] ?? (pc.role ? String(pc.role).toUpperCase() : "—");
                return (
                  <div
                    key={pc.id}
                    className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[#E7E5E4] pb-2">
                      <span className="rounded bg-[#E7E5E4] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#57534E]">
                        {roleLabel}
                      </span>
                      <span className="text-sm font-medium text-[#1C1917]">
                        {pc.companies?.name ?? "未知公司"}
                      </span>
                    </div>
                    {contacts.length === 0 ? (
                      <p className="text-xs text-[#A8A29E]">该公司在本楼盘下暂无联系人</p>
                    ) : (
                      <ul className="space-y-2">
                        {contacts.map((c) => (
                          <li
                            key={c.id}
                            className="rounded-md border border-[#E7E5E4] bg-white px-3 py-2 text-sm text-[#1C1917]"
                          >
                            <span className="font-medium">{c.name}</span>
                            {c.title && <span className="text-[#78716C]"> · {c.title}</span>}
                            {c.phone && <span className="text-[#78716C]"> · {c.phone}</span>}
                            {c.email && <span className="text-[#78716C]"> · {c.email}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PropertyForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (f: Record<string, string | number | null>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    address: "",
    region: "",
    area: "",
    areaCustom: "",
    price_range: "",
    units: "",
    build_year: "",
  });
  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const subAreaOptions = form.region && form.region !== "其他" ? AREA_MAP[form.region] ?? [] : [];
  const areaValue = form.area === "__custom__" ? form.areaCustom : form.region === "其他" ? form.areaCustom : form.area;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#1C1917]">新增楼盘</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3">
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="楼盘名称 *"
          className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
        />
        <input
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder="地址"
          className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.region}
            onChange={(e) => {
              set("region", e.target.value);
              set("area", "");
              set("areaCustom", "");
            }}
            className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          >
            <option value="">大区</option>
            {REGIONS.filter((r) => r !== "全部").map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {form.region && form.region !== "其他" && subAreaOptions.length > 0 ? (
            <select
              value={form.area}
              onChange={(e) => set("area", e.target.value)}
              className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            >
              <option value="">小区</option>
              {subAreaOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
              <option value="__custom__">其他（手动输入）</option>
            </select>
          ) : form.region === "其他" ? (
            <input
              value={form.areaCustom}
              onChange={(e) => set("areaCustom", e.target.value)}
              placeholder="输入小区名"
              className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            />
          ) : null}
        </div>
        {form.region && form.region !== "其他" && form.area === "__custom__" && (
          <input
            value={form.areaCustom}
            onChange={(e) => set("areaCustom", e.target.value)}
            placeholder="输入小区名（不在列表中）"
            className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
        )}
        <input
          value={form.price_range}
          onChange={(e) => set("price_range", e.target.value)}
          placeholder="价格范围"
          className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
        />
        <input
          value={form.units}
          onChange={(e) => set("units", e.target.value)}
          placeholder="户数"
          type="number"
          className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
        />
        <input
          value={form.build_year}
          onChange={(e) => set("build_year", e.target.value)}
          placeholder="建成年份"
          type="number"
          className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
        />
        <button
          type="button"
          disabled={!form.name.trim()}
          onClick={() =>
            onSubmit({
              name: form.name.trim(),
              address: form.address || null,
              area: areaValue.trim() || null,
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
