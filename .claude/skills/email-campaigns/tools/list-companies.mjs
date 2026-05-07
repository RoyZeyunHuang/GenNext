#!/usr/bin/env node
/**
 * 列候选公司(带主联系人邮箱与最近联系时间)。
 *
 *   --area <name>             过滤:任意关联楼盘 city/area 包含此关键字
 *   --not-contacted-days <n>  过滤:outreach.last_email_at 在 n 天前(或从未)
 *   --has-email               只要主联系人有 email
 *   --limit <n>               默认 50
 *   --search <text>           公司名 ilike
 */
import { supabase, parseArgs, out, fail } from "../lib/db.mjs";

const args = parseArgs(process.argv.slice(2));
const limit = Number(args.limit ?? 50);
const area = (args.area ?? "").trim().toLowerCase();
const search = (args.search ?? "").trim();
const notContactedDays = args["not-contacted-days"]
  ? Number(args["not-contacted-days"])
  : null;
const hasEmailFlag = Boolean(args["has-email"]);

let q = supabase
  .from("companies")
  .select(
    "id, name, email, contacts(id, name, email, is_primary), property_companies(role, properties(id, name, city, area, address))"
  )
  .order("name", { ascending: true })
  .limit(Math.max(limit * 3, 100));

if (search) q = q.ilike("name", `%${search}%`);

const { data: companies, error } = await q;
if (error) fail(error.message);

let propertyIds = new Set();
for (const c of companies ?? []) {
  for (const pc of c.property_companies ?? []) {
    if (pc.properties?.id) propertyIds.add(pc.properties.id);
  }
}

let lastEmailByProperty = new Map();
if (propertyIds.size > 0) {
  const { data: outreaches } = await supabase
    .from("outreach")
    .select("property_id, last_email_at")
    .in("property_id", Array.from(propertyIds));
  for (const o of outreaches ?? []) {
    if (o.property_id) lastEmailByProperty.set(o.property_id, o.last_email_at);
  }
}

const cutoffMs =
  notContactedDays != null ? Date.now() - notContactedDays * 24 * 3600_000 : null;

const rows = [];
for (const c of companies ?? []) {
  const contacts = c.contacts ?? [];
  const primary = contacts.find((x) => x.is_primary && x.email?.trim()) ?? contacts.find((x) => x.email?.trim());
  const primaryEmail = primary?.email?.trim() || c.email?.trim() || null;
  if (hasEmailFlag && !primaryEmail) continue;

  const props = (c.property_companies ?? [])
    .map((pc) => pc.properties)
    .filter(Boolean);

  if (area) {
    const match = props.some((p) => {
      const hay = `${p.area ?? ""} ${p.city ?? ""} ${p.address ?? ""}`.toLowerCase();
      return hay.includes(area);
    });
    if (!match) continue;
  }

  if (cutoffMs != null) {
    const lastList = props
      .map((p) => lastEmailByProperty.get(p.id))
      .filter(Boolean)
      .map((s) => new Date(s).getTime());
    const mostRecent = lastList.length ? Math.max(...lastList) : null;
    if (mostRecent != null && mostRecent > cutoffMs) continue; // 太新,跳过
  }

  rows.push({
    company_id: c.id,
    company_name: c.name,
    primary_contact_id: primary?.id ?? null,
    primary_contact_name: primary?.name ?? null,
    primary_contact_email: primaryEmail,
    contacts_count: contacts.length,
    properties: props.map((p) => ({ id: p.id, name: p.name, area: p.area, city: p.city })),
  });

  if (rows.length >= limit) break;
}

out({ count: rows.length, companies: rows });
