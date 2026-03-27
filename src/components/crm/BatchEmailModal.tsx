"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyTemplate,
  buildDeveloperBatchTemplateVars,
  contactFirstName,
  dedupePropertiesByIdPreferHigherUnits,
  isInvoManagedEmailTemplateName,
  invoBaseTemplateNameFromBuildYears,
  pickInvoMultiDeveloperEmailTemplate,
  sleep,
} from "@/lib/email-helpers";
import { INVO_DECK_FILENAME } from "@/lib/email-attachments";
import {
  AREA_MAP,
  getDisplayArea,
  getDisplayBoro,
  getRegionForArea,
  getSubAreaForFilter,
  subAreasMatch,
} from "@/lib/resolve-area";

type Template = { id: string; name: string; subject: string; body: string };

type PropertyRow = {
  row_key: string; // property_id + company_id + company_role
  property_id: string;
  property_name: string;
  address: string | null;
  /** DB 原始 area，用于解析失败时回退 */
  area: string | null;
  build_year: number | null;
  units: number | null;
  city: string | null;
  price_range: string | null;
  company_id: string;
  company_name: string | null;
  company_role: string;
  contact_name: string | null;
  email: string | null;
  stage: string;
};

type PreviewRecipient = { email: string; name: string | null };

type PreviewRow = {
  property_id: string | null;
  /** 同一开发商合并发信时涉及的全部楼盘 */
  property_ids?: string[] | null;
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
  /** 公司内多选收件人；缺省时由 to + contact_name 推导 */
  recipients?: PreviewRecipient[];
  /** 模板占位符原文；多收件人时发送阶段按每人重新套用。手动编辑主题/正文后会清空 */
  template_subject_raw?: string | null;
  template_body_raw?: string | null;
  /** 不含 contact_name；多收件人时与 raw 组合套用 */
  template_fill_vars?: Record<string, string> | null;
  /** 生成预览时实际套用的模版 id（合并时可能为 — Multi） */
  preview_template_id?: string | null;
};

type CompanyContactRow = {
  id: string;
  company_id: string;
  name: string | null;
  email: string | null;
  is_primary?: boolean | null;
};

function getPreviewRecipients(p: PreviewRow): PreviewRecipient[] {
  if (p.recipients && p.recipients.length > 0) return p.recipients;
  if (p.to && String(p.to).trim()) {
    return [{ email: String(p.to).trim(), name: p.contact_name ?? null }];
  }
  return [];
}

function mapContactsByCompany(contacts: any[]): Map<string, CompanyContactRow[]> {
  const m = new Map<string, CompanyContactRow[]>();
  for (const c of contacts) {
    if (!c?.company_id) continue;
    const cid = String(c.company_id);
    const row: CompanyContactRow = {
      id: String(c.id ?? ""),
      company_id: cid,
      name: c.name != null ? String(c.name) : null,
      email: c.email != null ? String(c.email) : null,
      is_primary: c.is_primary,
    };
    const arr = m.get(cid) ?? [];
    arr.push(row);
    m.set(cid, arr);
  }
  return m;
}

/**
 * 与初次 load() 一致：除当前扁平行上的 company_id 外，还要包含缓存里全部 property_companies 关联的公司。
 * 否则在「隐藏已有外联楼盘」等过滤下，部分公司不会出现在 properties 行里，刷新联系人会漏请求 company_id，
 * 公司页新加的联系人就不会出现在第 2 步多选列表中。
 */
function collectCompanyIdsForContactFetch(
  rows: PropertyRow[],
  cache: { propertiesRaw: any[] } | null | undefined
): string[] {
  const companyIdsSet = new Set<string>();
  for (const p of rows) {
    if (p.company_id) companyIdsSet.add(String(p.company_id));
  }
  if (cache?.propertiesRaw?.length) {
    for (const prop of cache.propertiesRaw) {
      const pcs = Array.isArray(prop?.property_companies) ? prop.property_companies : [];
      for (const pc of pcs) {
        const cid = pc?.company_id ?? pc?.companies?.id ?? pc?.companies?.company_id;
        if (cid) companyIdsSet.add(String(cid));
      }
    }
  }
  return Array.from(companyIdsSet);
}

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
  const propertiesRef = useRef<PropertyRow[]>([]);
  propertiesRef.current = properties;
  /** 公司 id → 联系人列表（用于第 2 步多选收件人） */
  const [companyContactsMap, setCompanyContactsMap] = useState<
    Map<string, CompanyContactRow[]>
  >(() => new Map());
  /** 第 2/3 步重新拉联系人（避免打开弹窗后公司页新增联系人仍为旧数据） */
  const [contactsRefreshing, setContactsRefreshing] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [regionFilter, setRegionFilter] = useState<string>("全部");
  const [subAreaFilter, setSubAreaFilter] = useState<string>("全部");
  const [buildYearFrom, setBuildYearFrom] = useState<string>("");
  const [buildYearTo, setBuildYearTo] = useState<string>("");
  const [unitsFrom, setUnitsFrom] = useState<string>("");
  const [unitsTo, setUnitsTo] = useState<string>("");
  const [priceRangeFilter, setPriceRangeFilter] = useState<"all" | "with" | "without">("all");
  const [emailFilter, setEmailFilter] = useState<"all" | "with" | "without">("with");
  const [search, setSearch] = useState<string>("");
  /** 批量输入模式：展开为多行 */
  const [searchBulkOpen, setSearchBulkOpen] = useState(false);
  const [batchSearchInput, setBatchSearchInput] = useState("");
  /** 批量/逗号匹配结果摘要 */
  const [matchResultLines, setMatchResultLines] = useState<
    | {
        ok: boolean;
        query: string;
        matchedCount: number;
        checkedCount: number;
        displayNames: string[];
      }[]
    | null
  >(null);
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

  /** true：HTML + 品牌信纸；false：纯文本 + 系统签名 */
  const [sendAsHtml, setSendAsHtml] = useState(true);
  /** 默认附带 public/invo-deck.pdf */
  const [attachInvoDeck, setAttachInvoDeck] = useState(true);
  /** 批量发信统一抄送/密送（可选） */
  const [ccLine, setCcLine] = useState("");
  const [bccLine, setBccLine] = useState("");

  const cancelGuard = useRef(false);
  /** 点击「批量输入」时跳过单行搜索 blur 触发的逗号匹配 */
  const skipSearchBlurMatchRef = useRef(false);

  /** 楼盘/outreach 原始数据缓存，切换过滤时无需重新请求 */
  const bulkPropertyLoadCacheRef = useRef<{
    propertiesRaw: any[];
    outreachItems: any[];
  } | null>(null);

  /**
   * true：不展示任意外联阶段 ≠「未开始」的楼盘（追踪中、Won、Lost 等均隐藏）
   * false：全部楼盘均可选
   */
  const [hideOutreachPropertiesInStep1, setHideOutreachPropertiesInStep1] =
    useState(true);
  const hideOutreachPropertiesInStep1Ref = useRef(true);
  hideOutreachPropertiesInStep1Ref.current = hideOutreachPropertiesInStep1;

  const buildPropertyRowsFromCache = useCallback(
    (
      excludeOutreach: boolean,
      contactsByCompanyId: Map<string, CompanyContactRow[]>
    ) => {
      const cache = bulkPropertyLoadCacheRef.current;
      if (!cache) return;
      const { propertiesRaw, outreachItems } = cache;

      const excludedOutreachPropertyIds = new Set<string>();
      if (excludeOutreach) {
        for (const item of outreachItems) {
          const pid = item?.property_id;
          if (!pid) continue;
          const st = String(item?.stage ?? item?.status ?? "Not Started").trim();
          if (st !== "Not Started") excludedOutreachPropertyIds.add(String(pid));
        }
      }

      const stageByPropertyId = new Map<string, string>();
      for (const item of outreachItems) {
        const pid = item?.property_id;
        if (!pid) continue;
        if (stageByPropertyId.has(pid)) continue;
        stageByPropertyId.set(
          pid,
          String(item?.stage ?? item?.status ?? "Not Started").trim()
        );
      }

      const rows: PropertyRow[] = [];
      for (const prop of propertiesRaw) {
        const property_id = String(prop?.id ?? "");
        if (excludeOutreach && excludedOutreachPropertyIds.has(property_id))
          continue;

        const property_name = String(prop?.name ?? "");
        const address = (prop?.address as string | null) ?? null;
        const area = (prop?.area as string | null) ?? null;
        const build_year = (prop?.build_year as number | null) ?? null;
        const units = (prop?.units as number | null) ?? null;
        const city = (prop?.city as string | null) ?? null;
        const price_range = (prop?.price_range as string | null) ?? null;
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
            (ct) => ct.is_primary && ct.email
          );
          const anyWithEmail = contacts.find((ct) => !!ct.email);
          const primaryOrFirst = contacts.find((ct) => ct.is_primary) ?? contacts[0];

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
            city,
            price_range,
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
      setSelectedIds((prev) => {
        const keys = new Set(rows.map((r) => r.row_key));
        const next = new Set<string>();
        prev.forEach((k) => {
          if (keys.has(k)) next.add(k);
        });
        return next;
      });
    },
    []
  );

  useEffect(() => {
    cancelGuard.current = false;
    return () => {
      cancelGuard.current = true;
    };
  }, []);

  useEffect(() => {
    if (!bulkPropertyLoadCacheRef.current) return;
    buildPropertyRowsFromCache(hideOutreachPropertiesInStep1, companyContactsMap);
  }, [
    hideOutreachPropertiesInStep1,
    companyContactsMap,
    buildPropertyRowsFromCache,
  ]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const pRes = await fetch("/api/crm/properties");
        const propertiesData = await pRes.json().catch(() => []);
        const propertiesRaw: any[] = Array.isArray(propertiesData) ? propertiesData : [];

        const oRes = await fetch("/api/crm/outreach");
        const outreachData = await oRes.json().catch(() => []);
        const outreachItems: any[] = Array.isArray(outreachData) ? outreachData : [];

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
            )}&_=${Date.now()}`,
            { cache: "no-store" }
          );
          contactsData = await cRes.json().catch(() => []);
        }

        const contactsByCompanyId = mapContactsByCompany(contactsData);
        bulkPropertyLoadCacheRef.current = { propertiesRaw, outreachItems };
        setCompanyContactsMap(contactsByCompanyId);
        buildPropertyRowsFromCache(
          hideOutreachPropertiesInStep1Ref.current,
          contactsByCompanyId
        );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在弹窗挂载时拉取一次；切换隐藏外联由独立 effect + 缓存重建行
  }, []);

  const fetchContactsForPropertyRows = useCallback(async (rows: PropertyRow[]) => {
    const companyIds = collectCompanyIdsForContactFetch(
      rows,
      bulkPropertyLoadCacheRef.current
    );
    if (!companyIds.length) {
      return new Map<string, CompanyContactRow[]>();
    }
    const cRes = await fetch(
      `/api/crm/contacts-bulk?company_ids=${encodeURIComponent(
        companyIds.join(",")
      )}&_=${Date.now()}`,
      { cache: "no-store" }
    );
    const contactsData = await cRes.json().catch(() => []);
    return mapContactsByCompany(Array.isArray(contactsData) ? contactsData : []);
  }, []);

  const reloadCompanyContacts = useCallback(async () => {
    const map = await fetchContactsForPropertyRows(propertiesRef.current);
    setCompanyContactsMap(map);
  }, [fetchContactsForPropertyRows]);

  /** 进入第 2 步时拉一次联系人；勿依赖 reloadCompanyContacts/properties（否则会 companyContactsMap→重建 properties→回调变身→无限循环） */
  useEffect(() => {
    if (step !== 2) return;
    const rows = propertiesRef.current;
    if (!rows.length) return;
    let cancelled = false;
    setContactsRefreshing(true);
    void fetchContactsForPropertyRows(rows)
      .then((map) => {
        if (!cancelled) setCompanyContactsMap(map);
      })
      .finally(() => {
        if (!cancelled) setContactsRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, fetchContactsForPropertyRows]);

  const selectedProperties = useMemo(() => {
    const set = selectedIds;
    return properties.filter((p) => set.has(p.row_key));
  }, [properties, selectedIds]);

  const filteredRows = useMemo(() => {
    const from = buildYearFrom.trim() ? Number(buildYearFrom) : null;
    const to = buildYearTo.trim() ? Number(buildYearTo) : null;
    const q = search.trim().toLowerCase();

    const ufRaw = unitsFrom.trim() ? Number(unitsFrom) : null;
    const utRaw = unitsTo.trim() ? Number(unitsTo) : null;
    const uf = ufRaw != null && Number.isFinite(ufRaw) ? ufRaw : null;
    const ut = utRaw != null && Number.isFinite(utRaw) ? utRaw : null;

    return properties.filter((p) => {
      const subForFilter = getSubAreaForFilter(p.address, p.area);
      const pRegion = getRegionForArea(subForFilter);

      if (regionFilter !== "全部") {
        if (regionFilter === "其他") {
          if (pRegion !== "其他") return false;
        } else {
          if (pRegion !== regionFilter) return false;
        }
      }

      if (regionFilter !== "全部" && regionFilter !== "其他") {
        if (subAreaFilter !== "全部" && !subAreasMatch(subAreaFilter, subForFilter)) {
          return false;
        }
      }

      if (from != null && p.build_year != null && p.build_year < from) return false;
      if (to != null && p.build_year != null && p.build_year > to) return false;

      if (uf != null || ut != null) {
        if (p.units == null || !Number.isFinite(p.units)) return false;
        if (uf != null && p.units < uf) return false;
        if (ut != null && p.units > ut) return false;
      }

      const hasPrice =
        p.price_range != null && String(p.price_range).trim() !== "";
      if (priceRangeFilter === "with" && !hasPrice) return false;
      if (priceRangeFilter === "without" && hasPrice) return false;

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
  }, [
    properties,
    regionFilter,
    subAreaFilter,
    buildYearFrom,
    buildYearTo,
    unitsFrom,
    unitsTo,
    priceRangeFilter,
    emailFilter,
    search,
    companyRoleFilter,
  ]);

  /** 按楼盘名模糊匹配（includes，不区分大小写）并勾选有邮箱的行 */
  const matchAndSelectTerms = useCallback(
    (rawTerms: string[]) => {
      const terms = rawTerms.map((t) => t.trim()).filter(Boolean);
      if (terms.length === 0) return;

      const lines: {
        ok: boolean;
        query: string;
        matchedCount: number;
        checkedCount: number;
        displayNames: string[];
      }[] = [];
      const toAdd = new Set<string>();

      for (const q of terms) {
        const qLower = q.toLowerCase();
        const matched = properties.filter((r) =>
          (r.property_name || "").toLowerCase().includes(qLower)
        );
        const selectable = matched.filter((r) => r.contact_name && r.email);
        const displayNames = Array.from(
          new Set(matched.map((r) => r.property_name))
        );

        if (matched.length === 0) {
          lines.push({
            ok: false,
            query: q,
            matchedCount: 0,
            checkedCount: 0,
            displayNames: [],
          });
        } else {
          selectable.forEach((r) => toAdd.add(r.row_key));
          lines.push({
            ok: true,
            query: q,
            matchedCount: matched.length,
            checkedCount: selectable.length,
            displayNames,
          });
        }
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        Array.from(toAdd).forEach((k) => next.add(k));
        return next;
      });
      setMatchResultLines(lines);
      setSearchBulkOpen(false);
      setBatchSearchInput("");
      setSearch("");
    },
    [properties]
  );

  useEffect(() => {
    if (!matchResultLines?.length) return;
    const t = setTimeout(() => setMatchResultLines(null), 12000);
    return () => clearTimeout(t);
  }, [matchResultLines]);

  const toggleSelect = (rowKey: string, enabled: boolean) => {
    if (!enabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  function buildPreviewFromTemplate(
    rows: PropertyRow[],
    tpl: Template,
    allTemplates: Template[]
  ): PreviewRow[] {
    const withEmail = rows.filter((r) => Boolean(r.email));
    const byCompany = new Map<string, PropertyRow[]>();
    for (const r of withEmail) {
      const arr = byCompany.get(r.company_id) ?? [];
      arr.push(r);
      byCompany.set(r.company_id, arr);
    }

    const out: PreviewRow[] = [];
    for (const group of Array.from(byCompany.values())) {
      const uniq = dedupePropertiesByIdPreferHigherUnits<PropertyRow>(group);
      const rep = uniq[0] ?? group[0];
      if (!rep?.email) continue;

      const property_ids = uniq.map((r) => r.property_id);
      const merged = property_ids.length > 1;
      const rowsForBuildYear = merged ? uniq : [rep];
      const invoAutoName = invoBaseTemplateNameFromBuildYears(
        rowsForBuildYear.map((r) => r.build_year)
      );
      let baseTplForInvo = tpl;
      if (isInvoManagedEmailTemplateName(tpl.name)) {
        baseTplForInvo =
          allTemplates.find((t) => t.name === invoAutoName) ?? tpl;
      }
      const effectiveTpl = pickInvoMultiDeveloperEmailTemplate(
        merged,
        baseTplForInvo,
        allTemplates
      );

      let subject: string;
      let body: string;
      let template_fill_vars: Record<string, string>;
      let displayPropertyName: string;

      if (!merged) {
        template_fill_vars = {
          company_name: rep.company_name ?? "",
          company_role: rep.company_role ?? "",
          property_name: rep.property_name || "",
        };
        const contact_name = contactFirstName(rep.contact_name ?? undefined);
        const vars: Record<string, string> = { ...template_fill_vars, contact_name };
        subject = applyTemplate(effectiveTpl.subject, vars);
        body = applyTemplate(effectiveTpl.body, vars);
        displayPropertyName = rep.property_name || "";
      } else {
        template_fill_vars = buildDeveloperBatchTemplateVars(uniq, {
          company_name: rep.company_name ?? "",
          company_role: rep.company_role ?? "",
        });
        const contact_name = contactFirstName(rep.contact_name ?? undefined);
        const vars: Record<string, string> = { ...template_fill_vars, contact_name };
        subject = applyTemplate(effectiveTpl.subject, vars);
        body = applyTemplate(effectiveTpl.body, vars);
        displayPropertyName = template_fill_vars.property_name;
      }

      out.push({
        property_id: rep.property_id,
        property_ids: merged ? property_ids : undefined,
        property_name: displayPropertyName,
        company_id: rep.company_id,
        company_name: rep.company_name,
        company_role: rep.company_role,
        selection_key: merged ? `merged__${rep.company_id}` : rep.row_key,
        to: rep.email,
        contact_name: rep.contact_name,
        stage: rep.stage,
        recipients: [
          {
            email: String(rep.email),
            name: rep.contact_name ?? null,
          },
        ],
        subject,
        body,
        template_subject_raw: effectiveTpl.subject,
        template_body_raw: effectiveTpl.body,
        template_fill_vars,
        preview_template_id: effectiveTpl.id,
      });
    }
    return out;
  }

  async function runAiForSelected() {
    if (selectedProperties.length === 0) return;
    const property_selections = selectedProperties.map((p) => ({
      property_id: p.property_id,
      property_name: p.property_name,
      address: p.address,
      area: (() => {
        const d = getDisplayArea(p.address, p.area);
        return d === "—" ? null : d;
      })(),
      build_year: p.build_year,
      units: p.units,
      price_range: p.price_range,
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
          contact_name: r.contact_name ?? null,
          recipients: [
            {
              email: String(r.to_email),
              name: r.contact_name ?? null,
            },
          ],
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

  const toggleRecipientForPreview = useCallback(
    (i: number, email: string, checked: boolean) => {
      setPreviews((prev) => {
        const base = prev[i];
        if (!base?.company_id) return prev;
        const contacts = companyContactsMap.get(base.company_id) ?? [];
        const cur = new Set(getPreviewRecipients(base).map((r) => r.email));
        if (checked) cur.add(email);
        else cur.delete(email);
        const ordered: PreviewRecipient[] = [];
        for (const c of contacts) {
          const em = c.email ? String(c.email).trim() : "";
          if (!em || !cur.has(em)) continue;
          ordered.push({ email: em, name: c.name ?? null });
        }
        const next = [...prev];
        if (ordered.length === 0) {
          next[i] = { ...base, recipients: [], to: null, contact_name: null };
          return next;
        }
        const first = ordered[0];
        const tplEffectiveId = base.preview_template_id ?? templateId;
        const tpl = templates.find((t) => t.id === tplEffectiveId);
        if (mode === "template" && tpl && first) {
          const fill = base.template_fill_vars;
          const vars: Record<string, string> = fill
            ? { ...fill, contact_name: contactFirstName(first.name ?? undefined) }
            : {
                company_name: base.company_name ?? "",
                contact_name: contactFirstName(first.name ?? undefined),
                property_name: base.property_name || "",
                company_role: base.company_role ?? "",
              };
          next[i] = {
            ...base,
            recipients: ordered,
            to: first.email,
            contact_name: first.name,
            subject: applyTemplate(tpl.subject, vars),
            body: applyTemplate(tpl.body, vars),
          };
        } else if (first) {
          next[i] = {
            ...base,
            recipients: ordered,
            to: first.email,
            contact_name: first.name,
          };
        }
        return next;
      });
    },
    [companyContactsMap, mode, templateId, templates]
  );

  const canProceedStep3 =
    previews.length > 0 &&
    previews.every((p) => {
      const recs = getPreviewRecipients(p);
      const hasProperty =
        Boolean(p.property_id) ||
        Boolean(p.property_ids && p.property_ids.length > 0);
      return (
        recs.length > 0 &&
        p.company_id &&
        hasProperty &&
        p.subject.trim() &&
        p.body.trim()
      );
    });
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
      if (p.property_ids?.length) {
        for (const id of p.property_ids) set.add(id);
      } else if (p.property_id) set.add(p.property_id);
    }
    return set.size;
  }, [previews]);

  /** 第 3 步实际发送封数（多收件人累加） */
  const totalEmailJobs = useMemo(() => {
    let n = 0;
    for (const p of previews) {
      for (const r of getPreviewRecipients(p)) {
        if (
          r.email?.trim() &&
          p.company_id &&
          (p.property_id || (p.property_ids && p.property_ids.length > 0)) &&
          p.subject?.trim() &&
          p.body?.trim()
        ) {
          n++;
        }
      }
    }
    return n;
  }, [previews]);

  async function sendAll() {
    type Job = { preview: PreviewRow; to: string; recipientName: string | null };
    const queue: Job[] = [];
    for (const p of previews) {
      for (const r of getPreviewRecipients(p)) {
        if (
          !r.email?.trim() ||
          !p.company_id ||
          (!p.property_id && !(p.property_ids && p.property_ids.length > 0)) ||
          !p.subject?.trim() ||
          !p.body?.trim()
        ) {
          continue;
        }
        queue.push({ preview: p, to: r.email.trim(), recipientName: r.name ?? null });
      }
    }
    const skippedCards = previews.filter((p) => getPreviewRecipients(p).length === 0).length;
    setSendProgress({
      running: true,
      done: 0,
      total: queue.length,
      success: 0,
      skipped: skippedCards,
      failed: 0,
      errors: [],
    });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < queue.length; i++) {
      if (cancelGuard.current) break;
      const { preview: p, to, recipientName } = queue[i];
      const recs = getPreviewRecipients(p);
      const fill = p.template_fill_vars;
      const vars: Record<string, string> = fill
        ? { ...fill, contact_name: contactFirstName(recipientName ?? undefined) }
        : {
            company_name: p.company_name ?? "",
            contact_name: contactFirstName(recipientName ?? undefined),
            property_name: p.property_name || "",
            company_role: p.company_role ?? "",
          };
      const useRawPerRecipient =
        mode === "template" &&
        Boolean(p.template_subject_raw && p.template_body_raw) &&
        recs.length > 1;
      const subject = useRawPerRecipient
        ? applyTemplate(p.template_subject_raw!, vars)
        : p.subject;
      const body = useRawPerRecipient
        ? applyTemplate(p.template_body_raw!, vars)
        : p.body;
      try {
        const ids =
          p.property_ids && p.property_ids.length > 0
            ? p.property_ids
            : p.property_id
              ? [p.property_id]
              : [];
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            subject,
            body,
            company_id: p.company_id,
            /** 显式 null + 双字段，避免 undefined 被 JSON 省略导致服务端收不到 property */
            property_id: ids[0] ?? p.property_id ?? null,
            property_ids: ids.length > 0 ? ids : [],
            property_display_name: p.property_name?.trim() || null,
            is_html: sendAsHtml,
            attachment_path: attachInvoDeck ? INVO_DECK_FILENAME : null,
            cc: ccLine.trim() || null,
            bcc: bccLine.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          failed++;
          errors.push(`${p.company_name} → ${to}: ${data.error ?? "发送失败"}`);
        } else {
          success++;
        }
      } catch (e) {
        failed++;
        errors.push(`${p.company_name} → ${to}: ${e instanceof Error ? e.message : String(e)}`);
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
    onDone?.({ success, failed, skipped: skippedCards });
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
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setHideOutreachPropertiesInStep1((v) => !v)
                  }
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    hideOutreachPropertiesInStep1
                      ? "border-[#1C1917] bg-[#1C1917] text-white"
                      : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#FAFAF9]"
                  )}
                  title="切换是否在列表中排除外联看板里阶段已非「未开始」的楼盘"
                >
                  {hideOutreachPropertiesInStep1
                    ? "已开启：隐藏外联中/已失败楼盘"
                    : "显示全部楼盘（含外联中）"}
                </button>
                <span className="text-[11px] leading-snug text-[#78716C]">
                  {hideOutreachPropertiesInStep1
                    ? "不展示外联阶段已推进或已终止的楼盘，减少重复触达。"
                    : "当前包含外联中的楼盘；批量发信前请自行核对是否重复联系。"}
                </span>
              </div>
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
                    <div className="flex flex-wrap items-center gap-2">
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
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-[#A8A29E]">快捷（配合两套 INVO 模版）：</span>
                      <button
                        type="button"
                        onClick={() => {
                          setBuildYearFrom("");
                          setBuildYearTo("2015");
                        }}
                        className="rounded border border-[#E7E5E4] bg-[#FAFAF9] px-2 py-0.5 text-[10px] text-[#57534E] hover:bg-[#F5F5F4]"
                      >
                        成熟楼宇 ≤2015
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBuildYearFrom("2016");
                          setBuildYearTo("");
                        }}
                        className="rounded border border-[#E7E5E4] bg-[#FAFAF9] px-2 py-0.5 text-[10px] text-[#57534E] hover:bg-[#F5F5F4]"
                      >
                        新盘 ≥2016
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBuildYearFrom("");
                          setBuildYearTo("");
                        }}
                        className="rounded border border-[#E7E5E4] px-2 py-0.5 text-[10px] text-[#78716C] hover:bg-[#F5F5F4]"
                      >
                        清除年份
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">Units</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={unitsFrom}
                        onChange={(e) => setUnitsFrom(e.target.value)}
                        placeholder="从"
                        type="number"
                        min={0}
                        className="h-9 w-20 rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                      />
                      <input
                        value={unitsTo}
                        onChange={(e) => setUnitsTo(e.target.value)}
                        placeholder="到"
                        type="number"
                        min={0}
                        className="h-9 w-20 rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">Price Range</div>
                    <select
                      value={priceRangeFilter}
                      onChange={(e) =>
                        setPriceRangeFilter(e.target.value as "all" | "with" | "without")
                      }
                      className="h-9 min-w-[150px] rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                    >
                      <option value="all">全部</option>
                      <option value="with">只看有</option>
                      <option value="without">只看无</option>
                    </select>
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

                  <div className="min-w-[280px] max-w-full flex-[1_1_320px]">
                    <div className="mb-1 text-[10px] font-medium text-[#78716C]">搜索</div>
                    {!searchBulkOpen ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && search.includes(",")) {
                              e.preventDefault();
                              matchAndSelectTerms(search.split(",").map((s) => s.trim()));
                            }
                          }}
                          onBlur={() => {
                            if (skipSearchBlurMatchRef.current) {
                              skipSearchBlurMatchRef.current = false;
                              return;
                            }
                            if (search.includes(",")) {
                              matchAndSelectTerms(
                                search.split(",").map((s) => s.trim()).filter(Boolean)
                              );
                            }
                          }}
                          placeholder="搜楼盘名或公司名；逗号分隔多个楼盘名，按 Enter 或失焦批量匹配并勾选"
                          className="h-9 min-w-[200px] flex-1 rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                        />
                        <button
                          type="button"
                          onMouseDown={() => {
                            skipSearchBlurMatchRef.current = true;
                          }}
                          onClick={() => {
                            setSearchBulkOpen(true);
                            setBatchSearchInput("");
                          }}
                          className="h-9 shrink-0 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-2.5 text-xs text-[#57534E] hover:bg-[#F5F5F4]"
                        >
                          批量输入
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-[#E7E5E4] bg-white p-2">
                        <textarea
                          value={batchSearchInput}
                          onChange={(e) => setBatchSearchInput(e.target.value)}
                          placeholder={
                            "每行输入一个楼盘名，回车分隔，如：\n505 Summit\nThe Danby\nJackson Park"
                          }
                          rows={4}
                          className="w-full resize-y rounded-md border border-[#E7E5E4] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#A8A29E]"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              matchAndSelectTerms(
                                batchSearchInput.split(/\r?\n/).map((s) => s.trim())
                              )
                            }
                            className="h-8 rounded-lg bg-[#1C1917] px-3 text-xs font-medium text-white hover:bg-[#1C1917]/90"
                          >
                            匹配并勾选
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchBulkOpen(false);
                              setBatchSearchInput("");
                            }}
                            className="h-8 rounded-lg border border-[#E7E5E4] px-3 text-xs text-[#78716C] hover:bg-[#F5F5F4]"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                    {matchResultLines && matchResultLines.length > 0 && (
                      <div className="mt-2 space-y-1 rounded-md border border-[#E7E5E4] bg-[#FAFAF9] p-2 text-[11px] leading-relaxed">
                        {matchResultLines.map((line, i) =>
                          line.ok ? (
                            <div key={i} className="text-[#1C1917]">
                              ✅ &quot;{line.query}&quot; → 匹配到 {line.matchedCount} 条
                              {line.displayNames.length > 0
                                ? `（${line.displayNames.join("、")}）`
                                : ""}
                              {line.checkedCount < line.matchedCount ? (
                                <span className="text-[#78716C]">
                                  ，已勾选 {line.checkedCount} 条（有邮箱）
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div key={i} className="text-red-600">
                              ❌ &quot;{line.query}&quot; → 未找到
                            </div>
                          )
                        )}
                      </div>
                    )}
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
                <table className="min-w-[1400px] w-full text-sm">
                  <thead className="bg-[#FAFAF9] text-xs text-[#78716C]">
                    <tr>
                      <th className="p-3 text-left">选择</th>
                      <th className="p-3 text-left">楼盘名</th>
                      <th className="p-3 text-left">Address</th>
                      <th className="p-3 text-left">boro</th>
                      <th className="p-3 text-left">Build Year</th>
                      <th className="p-3 text-left">Units</th>
                      <th className="p-3 text-left">Price Range</th>
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
                        <td colSpan={12} className="p-6 text-center text-xs text-[#78716C]">
                          没有匹配楼盘+公司
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r) => {
                        const disabled = !r.contact_name || !r.email;
                        const boroCell = getDisplayBoro(r.address, r.area);
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
                            <td className="max-w-[220px] break-words p-3 text-[#78716C]">
                              {r.address != null && String(r.address).trim() !== ""
                                ? r.address
                                : "—"}
                            </td>
                            <td className="p-3 text-[#78716C]">{boroCell}</td>
                            <td className="p-3 text-[#78716C]">{r.build_year ?? "—"}</td>
                            <td className="p-3 text-[#78716C]">{r.units != null ? r.units : "—"}</td>
                            <td className="p-3 text-[#78716C]">
                              {r.price_range != null && String(r.price_range).trim() !== ""
                                ? r.price_range
                                : "—"}
                            </td>
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
                  <p className="mt-1 text-xs text-[#78716C]">
                    模板模式或 AI 定制模式。若刚在公司页改了联系人，可点右侧刷新以免列表是旧的。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={contactsRefreshing}
                    onClick={() => {
                      setContactsRefreshing(true);
                      void reloadCompanyContacts().finally(() => setContactsRefreshing(false));
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 text-xs font-medium text-[#57534E] hover:bg-[#FAFAF9] disabled:opacity-50"
                  >
                    {contactsRefreshing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    刷新联系人
                  </button>
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
                  <p className="mb-3 text-xs text-[#78716C]">
                    选 INVO 任一套即可：<strong className="text-[#57534E]">Established / New</strong> 会按楼盘{" "}
                    <strong className="text-[#57534E]">build year</strong> 相对<strong>当前日历年</strong>自动选择（≥
                    本年 → New，更早 → Established）。同一开发商多选楼盘会合并为一封并自动用{" "}
                    <code className="rounded bg-[#F5F5F4] px-1 text-[10px]">— Multi</code> 模版。单盘原占位符{" "}
                    <code className="rounded bg-[#F5F5F4] px-1 text-[10px]">{"{{property_name}}"}</code>
                    ；多盘模版用{" "}
                    <code className="rounded bg-[#F5F5F4] px-1 text-[10px]">
                      {"{{property_intro_sentence}} … {{leasing_support_phrase}} / {{leasing_goals_focus}}"}
                    </code>
                  </p>
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
                          tpl,
                          templates
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
                    {previews.map((p, i) => {
                      const companyId = p.company_id;
                      const companyContacts = companyId
                        ? companyContactsMap.get(companyId) ?? []
                        : [];
                      const withEmail = companyContacts.filter(
                        (c) => c.email && String(c.email).trim()
                      );
                      const selectedEmails = new Set(
                        getPreviewRecipients(p).map((r) => r.email)
                      );
                      return (
                      <div
                        key={`${p.selection_key ?? `${p.property_id ?? ""}__${p.company_id ?? ""}`}__${i}`}
                        className={cn(
                          "rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3",
                          expandedIndex === i && "bg-white"
                        )}
                      >
                        {withEmail.length > 0 ? (
                          <div className="mb-3 rounded-md border border-[#E7E5E4] bg-white p-2">
                            <div className="text-[10px] font-medium text-[#78716C]">
                              收件人（公司内可多选）
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
                              {withEmail.map((c) => {
                                const em = String(c.email).trim();
                                return (
                                  <label
                                    key={c.id || em}
                                    className="flex cursor-pointer items-start gap-2 text-xs text-[#57534E]"
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 rounded border-[#E7E5E4]"
                                      checked={selectedEmails.has(em)}
                                      onChange={(e) =>
                                        toggleRecipientForPreview(i, em, e.target.checked)
                                      }
                                    />
                                    <span>
                                      <span className="font-medium text-[#1C1917]">
                                        {c.name?.trim() || "（无姓名）"}
                                      </span>
                                      <span className="text-[#A8A29E]"> · {em}</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            <p className="mt-2 text-[10px] leading-relaxed text-[#A8A29E]">
                              模板模式：多选时发送会<strong className="text-[#78716C]">分别发送</strong>
                              ，并对每位收件人重新套用占位符（
                              <code className="rounded bg-[#F5F5F4] px-0.5">{"{{contact_name}}"}</code>
                              等）。若你手动改过主题/正文，多收件人将共用该版正文。
                            </p>
                          </div>
                        ) : (
                          <div className="mb-2 text-[10px] text-amber-800">
                            该公司暂无带邮箱联系人，无法发送。
                          </div>
                        )}
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
                                {p.company_name ?? "—"} ·{" "}
                                {getPreviewRecipients(p)
                                  .map((r) => r.email)
                                  .join("，") || "无收件人"}{" "}
                                · {p.subject || "无主题"}
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
                                  updatePreview(i, {
                                    subject: e.target.value,
                                    template_subject_raw: null,
                                    template_body_raw: null,
                                  })
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
                                  updatePreview(i, {
                                    body: e.target.value,
                                    template_subject_raw: null,
                                    template_body_raw: null,
                                  })
                                }
                                rows={5}
                                className="w-full rounded-lg border border-[#E7E5E4] bg-white px-2 py-2 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>
              )}

              <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-[#57534E]">
                <input
                  type="checkbox"
                  checked={attachInvoDeck}
                  onChange={(e) => setAttachInvoDeck(e.target.checked)}
                  className="rounded border-[#E7E5E4]"
                />
                附加 PDF：{INVO_DECK_FILENAME}
              </label>

              <div className="mt-4 space-y-2 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3">
                <div className="text-[10px] font-medium text-[#78716C]">本批统一抄送（可选）</div>
                <input
                  value={ccLine}
                  onChange={(e) => setCcLine(e.target.value)}
                  placeholder="Cc：多个邮箱用逗号分隔"
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                />
                <input
                  value={bccLine}
                  onChange={(e) => setBccLine(e.target.value)}
                  placeholder="Bcc（可选）"
                  className="h-9 w-full rounded-lg border border-[#E7E5E4] bg-white px-2 text-sm"
                />
                <p className="text-[10px] text-[#A8A29E]">
                  可与环境变量 DEFAULT_CC_EMAIL 合并；每封仍会发给各自的收件人。
                </p>
              </div>

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
              <p className="mt-1 text-xs text-[#78716C]">
                即将发送 <strong className="text-[#1C1917]">{totalEmailJobs}</strong> 封（含同一楼盘多收件人）
              </p>
              <p className="mt-1 text-xs text-[#78716C]">覆盖 {propertyCount} 个楼盘 · {companyCount} 家公司</p>

              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#57534E]">
                <input
                  type="checkbox"
                  checked={sendAsHtml}
                  onChange={(e) => setSendAsHtml(e.target.checked)}
                  className="rounded border-[#E7E5E4]"
                />
                HTML 发送（品牌信纸）；关闭则纯文本并自动加签名
              </label>

              <div className="mt-3 rounded-lg border border-dashed border-[#D6D3D1] bg-[#FAFAF9] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">
                  附件
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[#1C1917]">
                  <input
                    type="checkbox"
                    checked={attachInvoDeck}
                    onChange={(e) => setAttachInvoDeck(e.target.checked)}
                    className="rounded border-[#E7E5E4]"
                  />
                  <span>
                    附带 PDF：<span className="font-mono text-[11px]">{INVO_DECK_FILENAME}</span>
                  </span>
                </label>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#A8A29E]">
                  {attachInvoDeck
                    ? "已开启：每封邮件将附带该文件（与第 2 步选项相同）。线上部署请在 .env 配置 NEXT_PUBLIC_APP_URL，否则服务器可能读不到 public 下的文件。"
                    : "当前不附带附件，仅发送正文。"}
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-[#E7E5E4] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-[#78716C]">
                    {sendProgress.running
                      ? `发送中：${sendProgress.done}/${sendProgress.total}`
                      : `就绪：${sendProgress.total || totalEmailJobs} 封`}
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
                  disabled={sendProgress.running || totalEmailJobs === 0}
                  className={cn(
                    "h-9 rounded-lg bg-[#1C1917] px-4 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50",
                    (sendProgress.running || totalEmailJobs === 0) && "cursor-not-allowed"
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

