import { supabase } from "@/lib/supabase";
import { classifyResendLastEvent, fetchAllResendSentList } from "@/lib/resend-list-sent";

function normEmail(s: string | null | undefined): string | null {
  const t = (s ?? "").trim().toLowerCase();
  return t || null;
}

type ContactRow = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  company_id: string;
};

type DbEmailRow = {
  id: string;
  resend_id: string | null;
  property_id: string | null;
  status: string | null;
  subject: string | null;
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

export type ResendPropertyEmailDetail = {
  email_row_id: string;
  resend_id: string;
  in_resend_api: boolean;
  resend_last_event: string | null;
  resend_subject: string | null;
  resend_created_at: string | null;
  db_status: string | null;
  to_email: string | null;
  classified: "bounce" | "delivered" | "pending" | "unknown";
  /** 与 contacts 表按邮箱匹配；优先楼盘关联公司下的联系人 */
  contact: { id: string; name: string; title: string | null } | null;
  contact_match: "property_company" | "global" | null;
};

export type ResendPropertyRow = {
  property_id: string;
  property_name: string;
  outcome: string;
  /** 按收件人说明谁已送达、谁退信、谁待判定（姓名来自数据库联系人，未匹配则仅显示邮箱） */
  recipient_intro: string;
  has_bounce: boolean;
  has_delivered: boolean;
  send_count: number;
  emails: ResendPropertyEmailDetail[];
};

export type ResendPropertyReport = {
  ok: true;
  resend_total_in_api: number;
  db_sent_rows_with_resend_id: number;
  db_rows_missing_property_id: number;
  db_rows_resend_id_not_found_in_api: number;
  properties: ResendPropertyRow[];
};

function formatRecipientLine(e: ResendPropertyEmailDetail): string {
  const addr = e.to_email ?? "—";
  if (e.contact?.name) return `${e.contact.name}（${addr}）`;
  return addr;
}

function buildRecipientIntro(emails: ResendPropertyEmailDetail[]): string {
  const delivered = emails.filter((x) => x.classified === "delivered");
  const bounced = emails.filter((x) => x.classified === "bounce");
  const pending = emails.filter((x) => x.classified === "pending" || x.classified === "unknown");
  const parts: string[] = [];
  if (delivered.length) parts.push(`已送达：${delivered.map(formatRecipientLine).join("、")}`);
  if (bounced.length) parts.push(`退信：${bounced.map(formatRecipientLine).join("、")}`);
  if (pending.length) parts.push(`待判定：${pending.map(formatRecipientLine).join("、")}`);
  return parts.join("。");
}

const RESEND_SYNC_NOTE_PREFIX = "（系统）自 Resend 送达报表同步";

/** 从 notes 去掉首段 Resend 同步（联系人已改存 contact_*） */
function stripResendSyncNotes(existing: string | null | undefined): string | null {
  const prev = (existing ?? "").trim();
  if (!prev) return null;
  const parts = prev.split("\n---\n");
  const first = parts[0] ?? "";
  if (first.trimStart().startsWith(RESEND_SYNC_NOTE_PREFIX)) {
    const rest = parts.slice(1).join("\n---\n").trim();
    return rest || null;
  }
  return prev;
}

/** 同步到 outreach 联系人栏：优先「已送达」收件人；若无则退信；再无则待判定 */
function buildResendContactFields(emails: ResendPropertyEmailDetail[]): {
  contact_name: string | null;
  contact_info: string | null;
} {
  const delivered = emails.filter((e) => e.classified === "delivered");
  const bounced = emails.filter((e) => e.classified === "bounce");
  const pending = emails.filter((e) => e.classified === "pending" || e.classified === "unknown");
  const pool =
    delivered.length > 0 ? delivered : bounced.length > 0 ? bounced : pending;
  if (pool.length === 0) return { contact_name: null, contact_info: null };
  const names = pool.map((e) => {
    if (e.contact?.name?.trim()) return e.contact.name.trim();
    const em = e.to_email?.trim();
    return em ? (em.split("@")[0] ?? em) : "—";
  });
  const infos = pool.map((e) => e.to_email?.trim()).filter((x): x is string => Boolean(x));
  return {
    contact_name: names.join("、"),
    contact_info: infos.join("、"),
  };
}

async function loadPropertyCompanyContacts(propertyIds: string[]) {
  const propertyCompanyIds = new Map<string, Set<string>>();
  const contactsByEmailNorm = new Map<string, ContactRow[]>();
  if (propertyIds.length === 0) {
    return { propertyCompanyIds, contactsByEmailNorm };
  }
  const { data: pcs, error: pcErr } = await supabase
    .from("property_companies")
    .select("property_id, company_id")
    .in("property_id", propertyIds);
  if (pcErr) throw new Error(pcErr.message);
  const allCompanyIds = new Set<string>();
  for (const row of pcs ?? []) {
    const pc = row as { property_id: string; company_id: string };
    if (!propertyCompanyIds.has(pc.property_id)) propertyCompanyIds.set(pc.property_id, new Set());
    propertyCompanyIds.get(pc.property_id)!.add(pc.company_id);
    allCompanyIds.add(pc.company_id);
  }
  if (allCompanyIds.size === 0) {
    return { propertyCompanyIds, contactsByEmailNorm };
  }
  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select("id, name, title, email, company_id")
    .in("company_id", Array.from(allCompanyIds));
  if (cErr) throw new Error(cErr.message);
  for (const c of (contacts ?? []) as ContactRow[]) {
    const k = normEmail(c.email);
    if (!k) continue;
    if (!contactsByEmailNorm.has(k)) contactsByEmailNorm.set(k, []);
    contactsByEmailNorm.get(k)!.push(c);
  }
  return { propertyCompanyIds, contactsByEmailNorm };
}

function pickPropertyContact(
  propertyId: string,
  toEmail: string | null,
  propertyCompanyIds: Map<string, Set<string>>,
  contactsByEmailNorm: Map<string, ContactRow[]>
): ContactRow | null {
  const k = normEmail(toEmail);
  if (!k) return null;
  const candidates = contactsByEmailNorm.get(k);
  if (!candidates?.length) return null;
  const propSet = propertyCompanyIds.get(propertyId);
  const onProp = candidates.filter((c) => propSet?.has(c.company_id));
  if (onProp.length) return onProp[0];
  return null;
}

async function fetchGlobalContactsByEmails(emails: string[]): Promise<Map<string, ContactRow>> {
  const out = new Map<string, ContactRow>();
  const unique = Array.from(
    new Set(emails.map(normEmail).filter((x): x is string => Boolean(x)))
  );
  await Promise.all(
    unique.map(async (em) => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, title, email, company_id")
        .ilike("email", em)
        .limit(12);
      if (error || !data?.length) return;
      const rows = data as ContactRow[];
      const exact = rows.find((c) => normEmail(c.email) === em);
      if (exact) out.set(em, exact);
    })
  );
  return out;
}

async function enrichEmailsWithContacts(
  byProperty: Map<string, { emails: ResendPropertyEmailDetail[] }>
): Promise<void> {
  const propertyIds = Array.from(byProperty.keys());
  const { propertyCompanyIds, contactsByEmailNorm } = await loadPropertyCompanyContacts(propertyIds);

  const globalLookupEmails: string[] = [];
  for (const [propertyId, g] of Array.from(byProperty.entries())) {
    for (const row of g.emails) {
      const picked = pickPropertyContact(propertyId, row.to_email, propertyCompanyIds, contactsByEmailNorm);
      if (picked) {
        row.contact = { id: picked.id, name: picked.name, title: picked.title };
        row.contact_match = "property_company";
      } else if (normEmail(row.to_email)) {
        globalLookupEmails.push(normEmail(row.to_email)!);
      }
    }
  }

  const globalMap = await fetchGlobalContactsByEmails(globalLookupEmails);
  for (const [, g] of Array.from(byProperty.entries())) {
    for (const row of g.emails) {
      if (row.contact) continue;
      const k = normEmail(row.to_email);
      if (!k) continue;
      const c = globalMap.get(k);
      if (c) {
        row.contact = { id: c.id, name: c.name, title: c.title };
        row.contact_match = "global";
      }
    }
  }
}

/**
 * 拉取 Resend 全量 + 库内已发邮件，按 property 汇总：
 * - 至少一封 delivered → has_delivered（绿色）；
 * - 仅当该盘**每一封**都是 bounce → has_bounce。
 */
export async function getResendPropertyReport(): Promise<ResendPropertyReport> {
  const resendById = await fetchAllResendSentList();

  const dbRows: DbEmailRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("emails")
      .select("id, resend_id, property_id, status, subject, to_email, created_at")
      .eq("direction", "sent")
      .not("resend_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }
    const chunk = (data ?? []) as DbEmailRow[];
    dbRows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  const propertyIds = Array.from(
    new Set(dbRows.map((r) => r.property_id).filter((id): id is string => Boolean(id)))
  );

  const nameByPropertyId = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: props, error: pErr } = await supabase
      .from("properties")
      .select("id, name")
      .in("id", propertyIds);
    if (pErr) {
      throw new Error(pErr.message);
    }
    for (const p of props ?? []) {
      const row = p as { id: string; name?: string };
      if (row.id) nameByPropertyId.set(row.id, row.name ?? "—");
    }
  }

  const byProperty = new Map<string, { emails: ResendPropertyEmailDetail[] }>();

  let dbRowsWithResendNotInApi = 0;
  let dbRowsNoProperty = 0;

  for (const row of dbRows) {
    const rid = row.resend_id?.trim();
    if (!rid) continue;

    if (!row.property_id) {
      dbRowsNoProperty++;
      continue;
    }

    const meta = resendById.get(rid);
    const inApi = Boolean(meta);
    if (!inApi) dbRowsWithResendNotInApi++;

    const lastEvent = meta?.last_event ?? null;
    let classified = classifyResendLastEvent(lastEvent).kind;
    if (classified === "unknown" || classified === "pending") {
      const hint = dbStatusHint(row.status);
      if (hint === "bounce") classified = "bounce";
      else if (hint === "delivered") classified = "delivered";
      else if (hint === "pending") classified = "pending";
    }

    const detail: ResendPropertyEmailDetail = {
      email_row_id: row.id,
      resend_id: rid,
      in_resend_api: inApi,
      resend_last_event: lastEvent,
      resend_subject: meta?.subject ?? row.subject,
      resend_created_at: meta?.created_at ?? null,
      db_status: row.status,
      to_email: row.to_email,
      classified,
      contact: null,
      contact_match: null,
    };

    const pid = row.property_id;
    let g = byProperty.get(pid);
    if (!g) {
      g = { emails: [] };
      byProperty.set(pid, g);
    }
    g.emails.push(detail);
  }

  await enrichEmailsWithContacts(byProperty);

  const properties: ResendPropertyRow[] = Array.from(byProperty.entries()).map(([property_id, g]) => {
    const emails = g.emails;
    const n = emails.length;
    /** 楼盘级：至少一封已成功送达（有人收到信）→ 绿色 */
    const anyDelivered = emails.some((e) => e.classified === "delivered");
    /** 楼盘级：每一封都是 bounce 才算 bounce（无人成功送达） */
    const allBounce = n > 0 && emails.every((e) => e.classified === "bounce");

    let outcome: string;
    if (anyDelivered) {
      const someBounce = emails.some((e) => e.classified === "bounce");
      outcome = someBounce
        ? "至少一人已收信（另有部分为 bounce）"
        : "已送达（至少一封已成功送达）";
    } else if (allBounce) {
      outcome = "全部为 bounce（无人成功送达）";
    } else {
      outcome = "待判定（尚无已确认送达；可能为 pending/unknown 或混有 bounce）";
    }

    return {
      property_id,
      property_name: nameByPropertyId.get(property_id) ?? "—",
      outcome,
      recipient_intro: buildRecipientIntro(emails),
      has_bounce: allBounce,
      has_delivered: anyDelivered,
      send_count: emails.length,
      emails,
    };
  });

  properties.sort((a, b) => (a.property_name || "").localeCompare(b.property_name || "", "en"));

  return {
    ok: true,
    resend_total_in_api: resendById.size,
    db_sent_rows_with_resend_id: dbRows.length,
    db_rows_missing_property_id: dbRowsNoProperty,
    db_rows_resend_id_not_found_in_api: dbRowsWithResendNotInApi,
    properties,
  };
}

const TERMINAL_STAGES = new Set(["Won", "Lost"]);

export type SyncResendToOutreachResult = {
  ok: true;
  updated: number;
  inserted: number;
  skipped_terminal: number;
  property_ids: string[];
};

/**
 * 将报表中每个楼盘同步到 outreach：stage → Email Pitched；
 * deal_status / needs_attention 同上；送达与退信联系人写入 contact_name、contact_info（不写 notes）。
 */
export async function syncResendReportToOutreach(
  report: ResendPropertyReport
): Promise<SyncResendToOutreachResult> {
  const now = new Date().toISOString();
  let updated = 0;
  let inserted = 0;
  let skipped_terminal = 0;
  const property_ids: string[] = [];

  for (const p of report.properties) {
    const deal_status = p.has_bounce ? "bounced" : "Active";
    const needs_attention = p.has_bounce;
    const { contact_name, contact_info } = buildResendContactFields(p.emails);

    const { data: rows, error: listErr } = await supabase
      .from("outreach")
      .select("id, stage, notes")
      .eq("property_id", p.property_id);

    if (listErr) {
      throw new Error(listErr.message);
    }

    const list = (rows ?? []) as { id: string; stage?: string | null; notes?: string | null }[];

    if (list.length === 0) {
      const { error: insErr } = await supabase.from("outreach").insert({
        property_id: p.property_id,
        stage: "Email Pitched",
        deal_status,
        needs_attention,
        contact_name,
        contact_info,
        updated_at: now,
        notes: null,
      });
      if (insErr) {
        throw new Error(insErr.message);
      }
      inserted++;
      property_ids.push(p.property_id);
      continue;
    }

    let touched = false;
    for (const row of list) {
      const st = (row.stage ?? "").trim();
      if (TERMINAL_STAGES.has(st)) {
        skipped_terminal++;
        continue;
      }
      const { error: upErr } = await supabase
        .from("outreach")
        .update({
          stage: "Email Pitched",
          deal_status,
          needs_attention,
          contact_name,
          contact_info,
          updated_at: now,
          notes: stripResendSyncNotes(row.notes),
        })
        .eq("id", row.id);
      if (upErr) {
        throw new Error(upErr.message);
      }
      updated++;
      touched = true;
    }
    if (touched) property_ids.push(p.property_id);
  }

  return {
    ok: true,
    updated,
    inserted,
    skipped_terminal,
    property_ids,
  };
}
