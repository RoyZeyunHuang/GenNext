"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTemplate, sleep } from "@/lib/email-helpers";

type Template = { id: string; name: string; subject: string; body: string };

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

function getRegionForArea(area: string | null): string {
  if (!area) return "其他";
  for (const [region, subAreas] of Object.entries(AREA_MAP)) {
    if (subAreas.includes(area)) return region;
  }
  return "其他";
}

type PropertyRow = {
  row_key: string; // property_id + company_id + company_role
  property_id: string;
  property_name: string;
  address: string | null;
  area: string | null;
  build_year: number | null;
  units: number | null;
  company_id: string;
  company_name: string | null;
  company_role: string;
  contact_name: string | null;
  email: string | null;
  stage: string;
};

type PreviewRow = {
  property_id: string | null;
  property_name: string;
  company_id: string | null;
  company_name: string | null;
  company_role?: string | null;
  to: string | null;
  subject: string;
  body: string;
  selection_key?: string | null;
  contact_name?: string | null;
  stage?: string;
};

export function BatchEmailModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone?: (result: { success: number; failed: number; skipped: number }) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [regionFilter, setRegionFilter] = useState<string>("全部");
  const [subAreaFilter, setSubAreaFilter] = useState<string>("全部");
  const [buildYearFrom, setBuildYearFrom] = useState<string>("");
  const [buildYearTo, setBuildYearTo] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState<"all" | "with" | "without">("with");
  const [search, setSearch] = useState<string>("");
  const [companyRoleFilter, setCompanyRoleFilter] = useState<string>("全部"); // 全部 / Developer / Marketing / Leasing / Management

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<"template" | "ai">("template");
  const [templateId, setTemplateId] = useState<string>("");

  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [aiProgress, setAiProgress] = useState({ running: false, done: 0, total: 0 });

  const [sendProgress, setSendProgress] = useState({
    running: false,
    done: 0,
    total: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  });

  const cancelGuard = useRef(false);

  useEffect(() => {
    cancelGuard.current = false;
    return () => {
      cancelGuard.current = true;
    };
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // 1) 拉取楼盘 + 外联（Stage）
        const pRes = await fetch("/api/crm/properties");
        const propertiesData = await pRes.json().catch(() => []);
        const propertiesRaw: any[] = Array.isArray(propertiesData) ? propertiesData : [];

        const oRes = await fetch("/api/crm/outreach");
        const outreachData = await oRes.json().catch(() => []);
        const outreachItems: any[] = Array.isArray(outreachData) ? outreachData : [];

        const stageByPropertyId = new Map<string, string>();
        for (const item of outreachItems) {
          const pid = item?.property_id;
          if (!pid) continue;
          if (stageByPropertyId.has(pid)) continue; // outreach 已按 updated_at desc
          stageByPropertyId.set(pid, item?.stage ?? item?.status ?? "Not Started");
        }

        // 2) 收集所有关联公司，批量拉联系人
        const companyIdsSet = new Set<string>();
        for (const prop of propertiesRaw) {
          const pcs = Array.isArray(prop?.property_companies) ? prop.property_companies : [];
          for (const pc of pcs) {
            const cid = pc?.company_id ?? pc?.companies?.id ?? pc?.companies?.company_id;
            if (cid) companyIdsSet.add(String(cid));
          }
        }
        const companyIds = Array.from(companyIdsSet);

        let contactsData: any[] = [];
        if (companyIds.length) {
          const cRes = await fetch(
            `/api/crm/contacts-bulk?company_ids=${encodeURIComponent(
              companyIds.join(",")
            )}`
          );
          contactsData = await cRes.json().catch(() => []);
        }

        const contactsByCompanyId = new Map<string, any[]>();
        for (const c of contactsData) {
          if (!c?.company_id) continue;
          const arr = contactsByCompanyId.get(c.company_id) ?? [];
          arr.push(c);
          contactsByCompanyId.set(c.company_id, arr);
        }

        // 3) 每个 property_companies 生成一行：楼盘 + 关联公司（并为该公司选一个联系人邮箱）
        const rows: PropertyRow[] = [];
        for (const prop of propertiesRaw) {
          const property_id = String(prop?.id ?? "");
          const property_name = String(prop?.name ?? "");
          const address = (prop?.address as string | null) ?? null;
          const area = (prop?.area as string | null) ?? null;
          const build_year = (prop?.build_year as number | null) ?? null;
          const units = (prop?.units as number | null) ?? null;
          const pcs = Array.isArray(prop?.property_companies)
            ? prop.property_companies
            : [];

          for (const pc of pcs) {
            const company_id = String(pc?.company_id ?? "");
            const company_name = (pc?.companies?.name as string | null) ?? null;
            const company_role = String(pc?.role ?? "");
            if (!property_id || !company_id || !company_role) continue;

            const contacts = contactsByCompanyId.get(company_id) ?? [];
            const primaryWithEmail = contacts.find(
              (ct: any) => ct?.is_primary && ct?.email
            );
            const anyWithEmail = contacts.find((ct: any) => !!ct?.email);
            const primaryOrFirst = contacts.find((ct: any) => ct?.is_primary) ?? contacts[0];

            const email: string | null = primaryWithEmail?.email
              ? String(primaryWithEmail.email)
              : anyWithEmail?.email
                ? String(anyWithEmail.email)
                : null;

            const contact_name: string | null = primaryWithEmail?.name
              ? String(primaryWithEmail.name)
              : anyWithEmail?.name
                ? String(anyWithEmail.name)
                : primaryOrFirst?.name
                  ? String(primaryOrFirst.name)
                  : null;

            const stage = stageByPropertyId.get(property_id) ?? "Not Started";

            const row_key = `${property_id}__${company_id}__${company_role}`;

            rows.push({
              row_key,
              property_id,
              property_name,
              address,
              area,
              build_year,
              units,
              company_id,
              company_name,
              company_role,
              contact_name,
              email,
              stage,
            });
          }
        }

        setProperties(rows);

        // 4) 邮件模板
        const tRes = await fetch("/api/email/templates");
        const tData = await tRes.json().catch(() => []);
        setTemplates(Array.isArray(tData) ? tData : []);
        const firstTpl = Array.isArray(tData) && tData[0]?.id ? tData[0].id : "";
        setTemplateId(firstTpl);
      } finally {
        if (!cancelGuard.current) setLoading(false);
      }
    }
    load();
  }, []);

  const selectedProperties = useMemo(() => {
    const set = selectedIds;
    return properties.filter((p) => set.has(p.row_key));
  }, [properties, selectedIds]);

  const filteredRows = useMemo(() => {
    const from = buildYearFrom.trim() ? Number(buildYearFrom) : null;
    const to = buildYearTo.trim() ? Number(buildYearTo) : null;
    const q = search.trim().toLowerCase();

    return properties.filter((p) => {
      const pRegion = getRegionForArea(p.area);

      if (regionFilter !== "全部") {
        if (regionFilter === "其他") {
          if (pRegion !== "其他") return false;
        } else {
          if (pRegion !== regionFilter) return false;
        }
      }

      if (regionFilter !== "全部" && regionFilter !== "其他") {
        if (subAreaFilter !== "全部" && p.area !== subAreaFilter) return false;
      }

      if (from != null && p.build_year != null && p.build_year < from) return false;
      if (to != null && p.build_year != null && p.build_year > to) return false;

      if (emailFilter === "with" && !p.email) return false;
      if (emailFilter === "without" && p.email) return false;

      if (companyRoleFilter !== "全部") {
        const roleValue = String(companyRoleFilter).toLowerCase();
        if (p.company_role?.toLowerCase() !== roleValue) return false;
      }

      if (q) {
        const hay =
          [p.property_name, p.company_name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [properties, regionFilter, subAreaFilter, buildYearFrom, buildYearTo, emailFilter, search, companyRoleFilter]);

  const toggleSelect = (rowKey: string, enabled: boolean) => {
    if (!enabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  function buildPreviewFromTemplate(rows: PropertyRow[], tpl: Template): PreviewRow[] {
    return rows
      .filter((r) => Boolean(r.email))
      .map((r) => {
        const vars = {
          company_name: r.company_name ?? "",
          contact_name: r.contact_name ?? "there",
          property_name: r.property_name || "",
          company_role: r.company_role ?? "",
        };
        const subject = applyTemplate(tpl.subject, vars);
        const body = applyTemplate(tpl.body, vars);
        return {
          property_id: r.property_id,
          property_name: r.property_name,
          company_id: r.company_id,
          company_name: r.company_name,
          company_role: r.company_role,
          selection_key: r.row_key,
          to: r.email,
          contact_name: r.contact_name,
          stage: r.stage,
          subject,
          body,
        };
      });
  }

  async function runAiForSelected() {
    if (selectedProperties.length === 0) return;
    const property_selections = selectedProperties.map((p) => ({
      property_id: p.property_id,
      property_name: p.property_name,
      address: p.address,
      area: p.area,
      build_year: p.build_year,
      units: p.units,
      company_id: p.company_id,
      company_name: p.company_name,
      company_role: p.company_role,
      selection_key: p.row_key,
      contact_name: p.contact_name,
      to_email: p.email,
      outreach_stage: p.stage,
    }));
    setAiProgress({ running: true, done: 0, total: property_selections.length });
    try {
      const res = await fetch("/api/ai/generate-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_selections }),
      });
      const data = await res.json();
      const list: any[] = Array.isArray(data.results) ? data.results : [];

      const next: PreviewRow[] = list
        .filter((r) => r?.to_email)
        .map((r) => ({
          property_id: r.property_id ?? null,
          property_name: r.property_name ?? "",
          company_id: r.company_id ?? null,
          company_name: r.company_name ?? null,
          company_role: r.company_role ?? null,
          selection_key: r.selection_key ?? null,
          to: r.to_email ?? null,
          subject: r.subject ?? "",
          body: r.body ?? "",
        }));

      setPreviews(next);
    } finally {
      if (!cancelGuard.current) setAiProgress({ running: false, done: 0, total: 0 });
    }
  }

  function updatePreview(i: number, patch: Partial<PreviewRow>) {
    setPreviews((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  const canProceedStep3 =
    previews.length > 0 &&
    previews.every((p) => p.to && p.company_id && p.property_id && p.subject.trim() && p.body.trim());
  const companyCount = useMemo(() => {
    const set = new Set<string>();
    for (const p of previews) {
      if (p.company_id) set.add(p.company_id);
    }
    return set.size;
  }, [previews]);

  const propertyCount = useMemo(() => {
    const set = new Set<string>();
    for (const p of previews) {
      if (p.property_id) set.add(p.property_id);
    }
    return set.size;
  }, [previews]);

  async function sendAll() {
    const queue = previews.filter(
      (p) => p.to && p.company_id && p.property_id && p.subject.trim() && p.body.trim()
    );
    setSendProgress({
      running: true,
      done: 0,
      total: queue.length,
      success: 0,
      skipped: previews.length - queue.length,
      failed: 0,
      errors: [],
    });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < queue.length; i++) {
      if (cancelGuard.current) break;
      const p = queue[i];
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: p.to,
            subject: p.subject,
            body: p.body,
            company_id: p.company_id,
            property_id: p.property_id,
            property_name: p.property_name,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          failed++;
          errors.push(`${p.company_name}: ${data.error ?? "发送失败"}`);
        } else {
          success++;
        }
      } catch (e) {
        failed++;
        errors.push(`${p.company_name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSendProgress((prev) => ({
          ...prev,
          done: i + 1,
          success,
          failed,
          errors: [...errors],
        }));
        await sleep(500);
      }
    }

    setSendProgress((prev) => ({ ...prev, running: false, success, failed }));
    onDone?.({ success, failed, skipped: previews.length - queue.length });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[#E7E5E4] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E7E5E4] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1C1917]">📧 批量发送</h3>
            <div className="mt-1 text-xs text-[#78716C]">
              步骤 {step}/3
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-[#78716C]">加载中…</div>
          ) : step === 1 ? (
            <div className="p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <div>
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">大区</div>
                    <select
                      value={regionFilter}
                      onChange={(e) => {
                        setRegionFilter(e.target.value);
                        setSubAreaFilter("全部");
                      }}
                      className="h-9 min-w-[150px] rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                    >
                      <option value="全部">全部</option>
                      {Object.keys(AREA_MAP).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="其他">其他</option>
                    </select>
                  </div>

                  {regionFilter !== "全部" && regionFilter !== "其他" && (
                    <div>
                      <div className="mb-1 text-[10px] font-medium text-[#78716C]">小区</div>
                      <select
                        value={subAreaFilter}
                        onChange={(e) => setSubAreaFilter(e.target.value)}
                        className="h-9 min-w-[170px] rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                      >
                        <option value="全部">全部</option>
                        {(AREA_MAP[regionFilter] ?? []).map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">Build Year</div>
                    <div className="flex gap-2">
                      <input
                        value={buildYearFrom}
                        onChange={(e) => setBuildYearFrom(e.target.value)}
                        placeholder="从"
                        type="number"
                        className="h-9 w-20 rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                      />
                      <input
                        value={buildYearTo}
                        onChange={(e) => setBuildYearTo(e.target.value)}
                        placeholder="到"
                        type="number"
                        className="h-9 w-20 rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">邮箱</div>
                    <select
                      value={emailFilter}
                      onChange={(e) => setEmailFilter(e.target.value as any)}
                      className="h-9 min-w-[170px] rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                    >
                      <option value="all">全部</option>
                      <option value="with">只看有邮箱</option>
                      <option value="without">只看无邮箱</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">搜索</div>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="搜楼盘名或公司名"
                      className="h-9 w-[260px] rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">
                      公司角色
                    </div>
                    <select
                      value={companyRoleFilter}
                      onChange={(e) => setCompanyRoleFilter(e.target.value)}
                      className="h-9 min-w-[190px] rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                    >
                      <option value="全部">全部</option>
                      <option value="Developer">Developer</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Leasing">Leasing</option>
                      <option value="Management">Management</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const keys = filteredRows
                        .filter((r) => !!r.email && !!r.contact_name)
                        .map((r) => r.row_key);
                      setSelectedIds(new Set(keys));
                    }}
                    disabled={!filteredRows.some((r) => !!r.email && !!r.contact_name)}
                    className={cn(
                      "h-9 rounded-lg border border-[#E7E5E4] px-3 text-xs text-[#78716C] hover:bg-[#F5F5F4] disabled:opacity-50"
                    )}
                  >
                    全选有邮箱的
                  </button>
                  <div className="text-xs text-[#78716C]">
                    已选 <span className="font-semibold text-[#1C1917]">{selectedIds.size}</span> 个组合
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-[#E7E5E4] bg-white">
                <table className="min-w-[1080px] w-full text-sm">
                  <thead className="bg-[#FAFAF9] text-xs text-[#78716C]">
                    <tr>
                      <th className="p-3 text-left">选择</th>
                      <th className="p-3 text-left">楼盘名</th>
                      <th className="p-3 text-left">区域</th>
                      <th className="p-3 text-left">Build Year</th>
                      <th className="p-3 text-left">关联公司</th>
                      <th className="p-3 text-left">公司角色</th>
                      <th className="p-3 text-left">联系人</th>
                      <th className="p-3 text-left">邮箱</th>
                      <th className="p-3 text-left">外联 Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-xs text-[#78716C]">
                          没有匹配楼盘+公司
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r) => {
                        const disabled = !r.contact_name || !r.email;
                        return (
                          <tr key={r.row_key} className={cn(disabled && "bg-[#FAFAF9] text-[#A8A29E]")}>
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(r.row_key)}
                                disabled={disabled}
                                onChange={() => toggleSelect(r.row_key, !disabled)}
                              />
                            </td>
                            <td className="p-3 font-medium text-[#1C1917]">{r.property_name}</td>
                            <td className="p-3 text-[#78716C]">{r.area ?? "—"}</td>
                            <td className="p-3 text-[#78716C]">{r.build_year ?? "—"}</td>
                            <td className="p-3 text-[#78716C]">{r.company_name ?? "—"}</td>
                            <td className="p-3 text-[#78716C]">
                              {r.company_role
                                ? String(r.company_role)
                                    .toLowerCase()
                                    .replace(/^\w/, (c) => c.toUpperCase())
                                : "—"}
                            </td>
                            <td className="p-3 text-[#78716C]">{r.contact_name ?? "—"}</td>
                            <td className="p-3 text-[#78716C]">
                              {r.email ?? <span className="italic text-[#A8A29E]">无邮箱</span>}
                            </td>
                            <td className="p-3 text-[#78716C]">{r.stage}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-[#E7E5E4] pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={selectedIds.size === 0}
                  className={cn(
                    "h-9 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50",
                    selectedIds.size === 0 && "cursor-not-allowed"
                  )}
                >
                  下一步
                </button>
              </div>
            </div>
          ) : step === 2 ? (
            <div className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-[#1C1917]">生成内容</h4>
                  <p className="mt-1 text-xs text-[#78716C]">模板模式或 AI 定制模式</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("template")}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs",
                      mode === "template"
                        ? "border-[#1C1917] bg-[#1C1917] text-white"
                        : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#FAFAF9]"
                    )}
                  >
                    模板模式
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("ai")}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs",
                      mode === "ai"
                        ? "border-[#1C1917] bg-[#1C1917] text-white"
                        : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#FAFAF9]"
                    )}
                  >
                    AI 定制
                  </button>
                </div>
              </div>

              {mode === "template" && (
                <div className="mt-4 rounded-lg border border-[#E7E5E4] bg-white p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div style={{ minWidth: 280 }}>
                      <div className="mb-1 text-[10px] font-medium text-[#78716C]">选择模板</div>
                      <select
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className="h-9 w-full rounded-lg border border-[#E7E5E4] px-2 text-sm"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const tpl = templates.find((t) => t.id === templateId);
                        if (!tpl) return;
                        const rows = buildPreviewFromTemplate(
                          selectedProperties,
                          tpl
                        );
                        setPreviews(rows);
                        setExpandedIndex(null);
                      }}
                      className="h-9 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90"
                      disabled={!templateId}
                    >
                      生成预览
                    </button>
                  </div>
                </div>
              )}

              {mode === "ai" && (
                <div className="mt-4 rounded-lg border border-[#E7E5E4] bg-white p-4">
                  <button
                    type="button"
                    onClick={runAiForSelected}
                    disabled={aiProgress.running || selectedProperties.length === 0}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
                  >
                    {aiProgress.running ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        生成中…
                      </>
                    ) : (
                      "AI 为每封邮件定制 Pitch"
                    )}
                  </button>
                </div>
              )}

              {/* Progress */}
              {previews.length > 0 && (
                <div className="mt-4 rounded-lg border border-[#E7E5E4] bg-white p-4">
                  <h4 className="text-sm font-medium text-[#1C1917]">预览列表</h4>
                  <p className="mt-1 text-xs text-[#78716C]">点击展开编辑修改</p>

                  <div className="mt-3 space-y-2">
                    {previews.map((p, i) => (
                      <div
                        key={p.selection_key ?? `${p.property_id ?? ""}__${p.company_id ?? ""}`}
                        className={cn(
                          "rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3",
                          expandedIndex === i && "bg-white"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedIndex((prev) => (prev === i ? null : i))
                          }
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[#1C1917]">
                                {p.property_name}
                              </div>
                              <div className="truncate text-xs text-[#78716C]">
                                {p.company_name ?? "—"} · {p.to ?? "无邮箱"} ·{" "}
                                {p.subject || "无主题"}
                              </div>
                            </div>
                            <div className="text-xs text-[#A8A29E]">
                              {expandedIndex === i ? "收起" : "展开"}
                            </div>
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-[#78716C] italic">
                            {p.body}
                          </div>
                        </button>

                        {expandedIndex === i && (
                          <div className="mt-3 space-y-2">
                            <div>
                              <div className="mb-1 text-[10px] font-medium text-[#78716C]">
                                Subject
                              </div>
                              <input
                                value={p.subject}
                                onChange={(e) =>
                                  updatePreview(i, { subject: e.target.value })
                                }
                                className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                              />
                            </div>
                            <div>
                              <div className="mb-1 text-[10px] font-medium text-[#78716C]">
                                Body
                              </div>
                              <textarea
                                value={p.body}
                                onChange={(e) =>
                                  updatePreview(i, { body: e.target.value })
                                }
                                rows={5}
                                className="w-full rounded-lg border border-[#E7E5E4] bg-white px-2 py-2 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#E7E5E4] pt-4">
                <button type="button" onClick={() => setStep(1)} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-xs text-[#78716C] hover:bg-[#F5F5F4]">上一步</button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!canProceedStep3}
                  className={cn(
                    "h-9 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50",
                    !canProceedStep3 && "cursor-not-allowed"
                  )}
                >
                  下一步
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <h4 className="text-sm font-medium text-[#1C1917]">确认发送</h4>
              <p className="mt-1 text-xs text-[#78716C]">即将为 {propertyCount} 个楼盘发送邮件</p>
              <p className="mt-1 text-xs text-[#78716C]">涉及 {companyCount} 家公司</p>

              <div className="mt-4 rounded-lg border border-[#E7E5E4] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-[#78716C]">
                    {sendProgress.running
                      ? `发送中：${sendProgress.done}/${sendProgress.total}`
                      : `就绪：${sendProgress.total || previews.length} 封`}
                  </div>
                  {sendProgress.running && (
                    <div className="text-xs text-[#78716C]">
                      成功 {sendProgress.success} · 失败 {sendProgress.failed}
                    </div>
                  )}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-[#F5F5F4]">
                  <div
                    className="h-full bg-[#1C1917]"
                    style={{
                      width:
                        sendProgress.total > 0
                          ? `${(sendProgress.done / sendProgress.total) * 100}%`
                          : "0%",
                    }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {previews.slice(0, 5).map((p) => (
                    <div
                      key={p.selection_key ?? `${p.property_id ?? ""}__${p.company_id ?? ""}`}
                      className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-3 py-2 text-xs text-[#78716C]"
                    >
                      <div className="font-medium text-[#1C1917]">{p.property_name}</div>
                      <div className="truncate text-xs text-[#78716C]">
                        {p.company_name ?? "—"}
                      </div>
                      <div className="truncate italic">{p.subject || "无主题"}</div>
                    </div>
                  ))}
                  {previews.length > 5 && (
                    <div className="text-xs text-[#78716C] self-center">
                      + {previews.length - 5} more
                    </div>
                  )}
                </div>
              </div>

              {sendProgress.errors.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <div className="font-medium">失败原因</div>
                  <ul className="mt-2 list-disc pl-5">
                    {sendProgress.errors.slice(0, 5).map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#E7E5E4] pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={sendProgress.running}
                  className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={sendAll}
                  disabled={sendProgress.running || previews.length === 0}
                  className={cn(
                    "h-9 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50",
                    (sendProgress.running || previews.length === 0) && "cursor-not-allowed"
                  )}
                >
                  {sendProgress.running ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      发送中…
                    </>
                  ) : (
                    "确认发送"
                  )}
                </button>
              </div>

              {sendProgress.done >= sendProgress.total && sendProgress.total > 0 && (
                <div className="mt-3 text-xs text-[#78716C]">
                  结果：成功 {sendProgress.success} / 跳过 {sendProgress.skipped} / 失败 {sendProgress.failed}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

