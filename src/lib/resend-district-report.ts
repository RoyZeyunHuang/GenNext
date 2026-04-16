/**
 * 按「区 / 小区」分组的 Email Pitch 送达报表。
 *
 * 数据链路（和 resend-property-report 同源，只是换汇总维度）：
 *   emails(direction=sent, resend_id IS NOT NULL)
 *     → properties(id, name, address)
 *     → resolveArea(address) → { borough, area }
 *     → property_companies(role='developer') → companies(id, name)
 *     → Resend API 分类送达/退信/待判定
 *
 * 聚合结果：
 *   - 每个区（borough）一行：展开看每个小区（area）
 *   - 每个小区：楼盘数、开发商数、邮件数（delivered/bounced/pending 明细）
 *   - 抽屉可下钻到具体楼盘列表
 */
import { supabase } from "@/lib/supabase";
import {
  classifyResendLastEvent,
  fetchAllResendSentList,
} from "@/lib/resend-list-sent";
import { resolveArea } from "@/lib/area-resolver";

type DbEmailRow = {
  id: string;
  resend_id: string | null;
  property_id: string | null;
  status: string | null;
  to_email: string | null;
  created_at: string;
};

function dbStatusHint(status: string | null | undefined): "bounce" | "delivered" | "pending" | null {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "bounced") return "bounce";
  if (s === "delivered" || s === "opened") return "delivered";
  if (s === "sent") return "pending";
  return null;
}

export type DistrictPitchPropertyRow = {
  property_id: string;
  property_name: string;
  address: string | null;
  developers: { id: string; name: string }[];
  email_count: number;
  delivered_count: number;
  bounced_count: number;
  pending_count: number;
};

export type DistrictPitchAreaRow = {
  borough: string;
  area: string;
  buildings: number;
  developers: number;
  emails: {
    total: number;
    delivered: number;
    bounced: number;
    pending: number;
  };
  properties: DistrictPitchPropertyRow[];
};

export type DistrictPitchBoroughGroup = {
  borough: string;
  buildings: number;
  developers: number;
  emails: {
    total: number;
    delivered: number;
    bounced: number;
    pending: number;
  };
  areas: DistrictPitchAreaRow[];
};

export type DistrictPitchReport = {
  ok: true;
  generated_at: string;
  totals: {
    buildings: number;
    developers: number;
    emails: { total: number; delivered: number; bounced: number; pending: number };
    unresolved_buildings: number; // 无法按地址判定区的楼盘数
  };
  boroughs: DistrictPitchBoroughGroup[];
};

const UNKNOWN_BOROUGH = "Unknown";
const UNKNOWN_AREA = "—";

/** 把 (borough, area) 用作 Map key */
function districtKey(b: string, a: string) {
  return `${b}||${a}`;
}

export async function getDistrictPitchReport(): Promise<DistrictPitchReport> {
  // 1. Resend 全量 API（送达分类依据）
  const { map: resendById } = await fetchAllResendSentList();

  // 2. 库内已发邮件（direction=sent 且有 resend_id，和 property-report 同口径）
  const dbRows: DbEmailRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("emails")
      .select("id, resend_id, property_id, status, to_email, created_at")
      .eq("direction", "sent")
      .not("resend_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as DbEmailRow[];
    dbRows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  // 3. 涉及到的 property_id 拉地址
  const propertyIds = Array.from(
    new Set(dbRows.map((r) => r.property_id).filter((x): x is string => Boolean(x)))
  );
  const propertyById = new Map<
    string,
    { id: string; name: string; address: string | null; area: string | null }
  >();
  if (propertyIds.length > 0) {
    const { data: props, error: pErr } = await supabase
      .from("properties")
      .select("id, name, address, area")
      .in("id", propertyIds);
    if (pErr) throw new Error(pErr.message);
    for (const p of (props ?? []) as {
      id: string;
      name: string | null;
      address: string | null;
      area: string | null;
    }[]) {
      propertyById.set(p.id, {
        id: p.id,
        name: p.name ?? "—",
        address: p.address,
        area: p.area,
      });
    }
  }

  // 4. property_companies(role=developer) → companies
  const devByProperty = new Map<string, { id: string; name: string }[]>();
  if (propertyIds.length > 0) {
    const { data: pcs, error: pcErr } = await supabase
      .from("property_companies")
      .select("property_id, company_id, role")
      .in("property_id", propertyIds)
      .eq("role", "developer");
    if (pcErr) throw new Error(pcErr.message);
    const pcRows = (pcs ?? []) as { property_id: string; company_id: string }[];
    const allCompanyIds = Array.from(new Set(pcRows.map((r) => r.company_id)));
    const companyById = new Map<string, string>();
    if (allCompanyIds.length > 0) {
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", allCompanyIds);
      if (cErr) throw new Error(cErr.message);
      for (const c of (companies ?? []) as { id: string; name: string | null }[]) {
        companyById.set(c.id, c.name ?? "—");
      }
    }
    for (const pc of pcRows) {
      const name = companyById.get(pc.company_id);
      if (!name) continue;
      if (!devByProperty.has(pc.property_id)) devByProperty.set(pc.property_id, []);
      const list = devByProperty.get(pc.property_id)!;
      if (!list.some((d) => d.id === pc.company_id)) {
        list.push({ id: pc.company_id, name });
      }
    }
  }

  // 5. 按 property_id 先汇：每楼的 emails 分类
  type PerPropertyAgg = {
    property_id: string;
    email_count: number;
    delivered: number;
    bounced: number;
    pending: number;
  };
  const perProperty = new Map<string, PerPropertyAgg>();

  for (const row of dbRows) {
    const pid = row.property_id;
    if (!pid) continue;
    const rid = row.resend_id?.trim();
    if (!rid) continue;

    const meta = resendById.get(rid);
    let classified = classifyResendLastEvent(meta?.last_event ?? null).kind;
    if (classified === "unknown" || classified === "pending") {
      const hint = dbStatusHint(row.status);
      if (hint === "bounce") classified = "bounce";
      else if (hint === "delivered") classified = "delivered";
      else if (hint === "pending") classified = "pending";
    }

    let agg = perProperty.get(pid);
    if (!agg) {
      agg = { property_id: pid, email_count: 0, delivered: 0, bounced: 0, pending: 0 };
      perProperty.set(pid, agg);
    }
    agg.email_count += 1;
    if (classified === "delivered") agg.delivered += 1;
    else if (classified === "bounce") agg.bounced += 1;
    else agg.pending += 1;
  }

  // 6. 按 (borough, area) 汇总
  type DistrictAgg = {
    borough: string;
    area: string;
    propertyIds: Set<string>;
    developerIds: Set<string>;
    emails: { total: number; delivered: number; bounced: number; pending: number };
    properties: DistrictPitchPropertyRow[];
  };
  const byDistrict = new Map<string, DistrictAgg>();
  let unresolvedBuildings = 0;

  for (const [pid, agg] of Array.from(perProperty.entries())) {
    const prop = propertyById.get(pid);
    const { borough: rb, area: ra } = resolveArea(prop?.address ?? null);
    let borough = rb;
    let area = ra;
    // 如果 ZIP / 关键词都没匹配到，用 properties.area 列兜底（freeform），borough 标 Unknown
    if (!borough) {
      borough = UNKNOWN_BOROUGH;
      area = prop?.area || UNKNOWN_AREA;
      if (!prop?.address) unresolvedBuildings += 1;
      else unresolvedBuildings += 1; // 有地址但 resolver 没识别也计入未知
    }
    if (!area) area = prop?.area || UNKNOWN_AREA;

    const k = districtKey(borough, area);
    let d = byDistrict.get(k);
    if (!d) {
      d = {
        borough,
        area,
        propertyIds: new Set(),
        developerIds: new Set(),
        emails: { total: 0, delivered: 0, bounced: 0, pending: 0 },
        properties: [],
      };
      byDistrict.set(k, d);
    }
    d.propertyIds.add(pid);
    const devs = devByProperty.get(pid) ?? [];
    for (const dev of devs) d.developerIds.add(dev.id);
    d.emails.total += agg.email_count;
    d.emails.delivered += agg.delivered;
    d.emails.bounced += agg.bounced;
    d.emails.pending += agg.pending;
    d.properties.push({
      property_id: pid,
      property_name: prop?.name ?? "—",
      address: prop?.address ?? null,
      developers: devs,
      email_count: agg.email_count,
      delivered_count: agg.delivered,
      bounced_count: agg.bounced,
      pending_count: agg.pending,
    });
  }

  // 7. 分组到 borough
  type BoroughBucket = {
    borough: string;
    buildings: Set<string>;
    developers: Set<string>;
    emails: { total: number; delivered: number; bounced: number; pending: number };
    areas: DistrictPitchAreaRow[];
  };
  const byBorough = new Map<string, BoroughBucket>();

  for (const d of Array.from(byDistrict.values())) {
    let b = byBorough.get(d.borough);
    if (!b) {
      b = {
        borough: d.borough,
        buildings: new Set(),
        developers: new Set(),
        emails: { total: 0, delivered: 0, bounced: 0, pending: 0 },
        areas: [],
      };
      byBorough.set(d.borough, b);
    }
    for (const pid of Array.from(d.propertyIds)) b.buildings.add(pid);
    for (const did of Array.from(d.developerIds)) b.developers.add(did);
    b.emails.total += d.emails.total;
    b.emails.delivered += d.emails.delivered;
    b.emails.bounced += d.emails.bounced;
    b.emails.pending += d.emails.pending;

    // 楼盘按邮件数倒序
    const properties = d.properties.slice().sort((a, z) => z.email_count - a.email_count);
    b.areas.push({
      borough: d.borough,
      area: d.area,
      buildings: d.propertyIds.size,
      developers: d.developerIds.size,
      emails: d.emails,
      properties,
    });
  }

  const BOROUGH_ORDER = [
    "Manhattan",
    "Brooklyn",
    "Queens",
    "Bronx",
    "Staten Island",
    "Jersey City",
    "Hoboken",
    "Other NJ",
    UNKNOWN_BOROUGH,
  ];
  const boroughs: DistrictPitchBoroughGroup[] = Array.from(byBorough.values())
    .map((b) => ({
      borough: b.borough,
      buildings: b.buildings.size,
      developers: b.developers.size,
      emails: b.emails,
      // 小区按邮件数倒序
      areas: b.areas.slice().sort((a, z) => z.emails.total - a.emails.total),
    }))
    .sort((a, z) => {
      const ai = BOROUGH_ORDER.indexOf(a.borough);
      const zi = BOROUGH_ORDER.indexOf(z.borough);
      if (ai === -1 && zi === -1) return a.borough.localeCompare(z.borough);
      if (ai === -1) return 1;
      if (zi === -1) return -1;
      return ai - zi;
    });

  // 8. 全局 totals（用集合去重再计数，跨区的楼盘/开发商不重复计）
  const totalBuildings = new Set<string>();
  const totalDevelopers = new Set<string>();
  const totalEmails = { total: 0, delivered: 0, bounced: 0, pending: 0 };
  for (const b of Array.from(byBorough.values())) {
    for (const pid of Array.from(b.buildings)) totalBuildings.add(pid);
    for (const did of Array.from(b.developers)) totalDevelopers.add(did);
    totalEmails.total += b.emails.total;
    totalEmails.delivered += b.emails.delivered;
    totalEmails.bounced += b.emails.bounced;
    totalEmails.pending += b.emails.pending;
  }

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    totals: {
      buildings: totalBuildings.size,
      developers: totalDevelopers.size,
      emails: totalEmails,
      unresolved_buildings: unresolvedBuildings,
    },
    boroughs,
  };
}
