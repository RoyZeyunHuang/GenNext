"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapPin,
  ChevronRight,
  ChevronDown,
  Building2,
  Factory,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

type EmailStats = { total: number; delivered: number; bounced: number; pending: number };

type PropertyRow = {
  property_id: string;
  property_name: string;
  address: string | null;
  developers: { id: string; name: string }[];
  email_count: number;
  delivered_count: number;
  bounced_count: number;
  pending_count: number;
};

type AreaRow = {
  borough: string;
  area: string;
  buildings: number;
  developers: number;
  emails: EmailStats;
  properties: PropertyRow[];
};

type BoroughGroup = {
  borough: string;
  buildings: number;
  developers: number;
  emails: EmailStats;
  areas: AreaRow[];
};

type Report = {
  ok: true;
  generated_at: string;
  totals: {
    buildings: number;
    developers: number;
    emails: EmailStats;
    unresolved_buildings: number;
  };
  boroughs: BoroughGroup[];
};

function pct(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

export function DistrictPitchReport() {
  const { locale } = useLocale();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expandedBoroughs, setExpandedBoroughs] = useState<Set<string>>(new Set());
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    fetch("/api/crm/email-pitch-by-district")
      .then(async (r) => {
        const d = await r.json();
        if (!alive) return;
        if (!r.ok || d.error) {
          setErr(d.error || `HTTP ${r.status}`);
        } else {
          setReport(d as Report);
          // 默认展开邮件数最多的那个区
          if (Array.isArray(d.boroughs) && d.boroughs.length > 0) {
            const top = [...d.boroughs].sort(
              (a, b) => b.emails.total - a.emails.total
            )[0];
            if (top) setExpandedBoroughs(new Set([top.borough]));
          }
        }
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const L = useMemo(() => {
    const zh = locale === "zh";
    return {
      title: zh ? "按区 / 小区 统计 Email Pitch" : "Email Pitch by District",
      subtitle: zh
        ? "按地址 ZIP 自动归入纽约各区；展开区看各小区明细，再展开看具体楼盘"
        : "Grouped by address ZIP into NYC boroughs; expand to drill into areas and properties",
      total: zh ? "总计" : "Total",
      buildings: zh ? "楼盘" : "Buildings",
      developers: zh ? "开发商" : "Developers",
      emails: zh ? "邮件" : "Emails",
      delivered: zh ? "已送达" : "Delivered",
      bounced: zh ? "退信" : "Bounced",
      pending: zh ? "待判定" : "Pending",
      areaCol: zh ? "小区" : "Area",
      propertyCol: zh ? "楼盘" : "Property",
      address: zh ? "地址" : "Address",
      developerCol: zh ? "开发商" : "Developer",
      empty: zh ? "暂无已发邮件数据" : "No sent-email data yet",
      unresolved: zh
        ? "未能按地址归区的楼盘数"
        : "Buildings not resolvable by address",
      loading: zh ? "加载中…" : "Loading…",
    };
  }, [locale]);

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-5 shadow-card">
        <p className="py-6 text-center text-sm text-[#78716C]">{L.loading}</p>
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-lg bg-white p-5 shadow-card">
        <p className="py-6 text-center text-sm text-red-600">{err}</p>
      </div>
    );
  }
  if (!report) return null;

  const toggleBorough = (b: string) => {
    const n = new Set(expandedBoroughs);
    if (n.has(b)) n.delete(b);
    else n.add(b);
    setExpandedBoroughs(n);
  };
  const toggleArea = (k: string) => {
    const n = new Set(expandedAreas);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setExpandedAreas(n);
  };

  const totals = report.totals;

  return (
    <div className="rounded-lg bg-white p-5 shadow-card">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-[#1C1917]">
        <MapPin className="h-4 w-4 text-[#78716C]" />
        {L.title}
      </h3>
      <p className="mb-4 text-xs text-[#A8A29E]">{L.subtitle}</p>

      {/* Totals strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBox icon={Building2} label={`${L.total} · ${L.buildings}`} value={totals.buildings} />
        <KpiBox
          icon={Factory}
          label={`${L.total} · ${L.developers}`}
          value={totals.developers}
        />
        <KpiBox icon={Mail} label={`${L.total} · ${L.emails}`} value={totals.emails.total} />
        <KpiBox
          icon={CheckCircle2}
          label={L.delivered}
          value={`${totals.emails.delivered} (${pct(totals.emails.delivered, totals.emails.total)})`}
          accent="#21c354"
        />
      </div>

      {report.boroughs.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#78716C]">{L.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E4] text-left text-xs font-medium text-[#78716C]">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2">{locale === "zh" ? "区 / 小区" : "Borough / Area"}</th>
                <th className="px-2 py-2 text-right">{L.buildings}</th>
                <th className="px-2 py-2 text-right">{L.developers}</th>
                <th className="px-2 py-2 text-right">{L.emails}</th>
                <th className="px-2 py-2 text-right text-[#21c354]">{L.delivered}</th>
                <th className="px-2 py-2 text-right text-[#ff4b4b]">{L.bounced}</th>
                <th className="px-2 py-2 text-right text-[#a78b4f]">{L.pending}</th>
              </tr>
            </thead>
            <tbody>
              {report.boroughs.map((b) => {
                const isExpanded = expandedBoroughs.has(b.borough);
                return (
                  <BoroughRows
                    key={b.borough}
                    borough={b}
                    expanded={isExpanded}
                    onToggle={() => toggleBorough(b.borough)}
                    areaExpanded={expandedAreas}
                    onToggleArea={toggleArea}
                    labels={L}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totals.unresolved_buildings > 0 ? (
        <p className="mt-3 text-xs text-[#A8A29E]">
          {L.unresolved}: {totals.unresolved_buildings}
        </p>
      ) : null}
    </div>
  );
}

function KpiBox({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-[#78716C]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className="text-xl font-semibold tabular-nums"
        style={accent ? { color: accent } : { color: "#1C1917" }}
      >
        {value}
      </div>
    </div>
  );
}

type Labels = {
  title: string;
  subtitle: string;
  total: string;
  buildings: string;
  developers: string;
  emails: string;
  delivered: string;
  bounced: string;
  pending: string;
  areaCol: string;
  propertyCol: string;
  address: string;
  developerCol: string;
  empty: string;
  unresolved: string;
  loading: string;
};

function BoroughRows({
  borough,
  expanded,
  onToggle,
  areaExpanded,
  onToggleArea,
  labels,
}: {
  borough: BoroughGroup;
  expanded: boolean;
  onToggle: () => void;
  areaExpanded: Set<string>;
  onToggleArea: (k: string) => void;
  labels: Labels;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-[#E7E5E4] bg-[#FAFAF9] font-medium hover:bg-[#F5F5F4]"
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-[#78716C]">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="px-2 py-2 text-[#1C1917]">{borough.borough}</td>
        <td className="px-2 py-2 text-right tabular-nums">{borough.buildings}</td>
        <td className="px-2 py-2 text-right tabular-nums">{borough.developers}</td>
        <td className="px-2 py-2 text-right tabular-nums">{borough.emails.total}</td>
        <td className="px-2 py-2 text-right tabular-nums text-[#21c354]">
          {borough.emails.delivered}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-[#ff4b4b]">
          {borough.emails.bounced}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-[#a78b4f]">
          {borough.emails.pending}
        </td>
      </tr>
      {expanded
        ? borough.areas.map((a) => {
            const key = `${a.borough}||${a.area}`;
            const aex = areaExpanded.has(key);
            return (
              <AreaRows
                key={key}
                area={a}
                expanded={aex}
                onToggle={() => onToggleArea(key)}
                labels={labels}
              />
            );
          })
        : null}
    </>
  );
}

function AreaRows({
  area,
  expanded,
  onToggle,
  labels,
}: {
  area: AreaRow;
  expanded: boolean;
  onToggle: () => void;
  labels: Labels;
}) {
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b border-[#E7E5E4] hover:bg-[#FAFAF9]",
          expanded ? "bg-[#FAFAF9]" : ""
        )}
        onClick={onToggle}
      >
        <td className="px-2 py-2 pl-6 text-[#A8A29E]">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </td>
        <td className="px-2 py-2 text-[#44403C]">{area.area}</td>
        <td className="px-2 py-2 text-right tabular-nums">{area.buildings}</td>
        <td className="px-2 py-2 text-right tabular-nums">{area.developers}</td>
        <td className="px-2 py-2 text-right tabular-nums">{area.emails.total}</td>
        <td className="px-2 py-2 text-right tabular-nums text-[#21c354]">
          {area.emails.delivered}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-[#ff4b4b]">
          {area.emails.bounced}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-[#a78b4f]">
          {area.emails.pending}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[#E7E5E4] bg-white">
          <td />
          <td colSpan={7} className="px-2 py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E7E5E4] text-left text-[#78716C]">
                    <th className="px-2 py-1">{labels.propertyCol}</th>
                    <th className="px-2 py-1">{labels.address}</th>
                    <th className="px-2 py-1">{labels.developerCol}</th>
                    <th className="px-2 py-1 text-right">{labels.emails}</th>
                    <th className="px-2 py-1 text-right text-[#21c354]">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {labels.delivered}
                      </span>
                    </th>
                    <th className="px-2 py-1 text-right text-[#ff4b4b]">
                      <span className="inline-flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> {labels.bounced}
                      </span>
                    </th>
                    <th className="px-2 py-1 text-right text-[#a78b4f]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {labels.pending}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {area.properties.map((p) => (
                    <tr key={p.property_id} className="border-b border-[#F5F5F4] last:border-0">
                      <td className="px-2 py-1.5 font-medium text-[#1C1917]">{p.property_name}</td>
                      <td className="px-2 py-1.5 text-[#78716C]">{p.address ?? "—"}</td>
                      <td className="px-2 py-1.5 text-[#44403C]">
                        {p.developers.length === 0
                          ? "—"
                          : p.developers.map((d) => d.name).join("、")}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{p.email_count}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[#21c354]">
                        {p.delivered_count}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[#ff4b4b]">
                        {p.bounced_count}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[#a78b4f]">
                        {p.pending_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
