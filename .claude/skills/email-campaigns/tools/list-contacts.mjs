#!/usr/bin/env node
/**
 * 拉联系人详情 + 关联公司 + 关联楼盘。
 *
 *   --company <id>     列指定公司的所有联系人
 *   --ids <id,id,id>   按 contact id 列表拉
 *   --has-email        只要有 email 的联系人
 */
import { supabase, parseArgs, out, fail } from "../lib/db.mjs";

const args = parseArgs(process.argv.slice(2));
const company = args.company;
const idsArg = args.ids;
const hasEmail = Boolean(args["has-email"]);

let q = supabase
  .from("contacts")
  .select(
    "id, name, email, title, is_primary, company_id, companies(id, name, property_companies(role, properties(id, name, area, city, address, build_year, units)))"
  )
  .order("is_primary", { ascending: false })
  .order("name", { ascending: true });

if (company) q = q.eq("company_id", company);
if (idsArg) q = q.in("id", String(idsArg).split(",").map((s) => s.trim()).filter(Boolean));

const { data, error } = await q;
if (error) fail(error.message);

const rows = (data ?? [])
  .filter((c) => !hasEmail || (c.email && c.email.trim()))
  .map((c) => {
    const properties = (c.companies?.property_companies ?? [])
      .map((pc) => ({
        id: pc.properties?.id,
        name: pc.properties?.name,
        area: pc.properties?.area,
        city: pc.properties?.city,
        address: pc.properties?.address,
        build_year: pc.properties?.build_year,
        units: pc.properties?.units,
        role: pc.role,
      }))
      .filter((p) => p.id && p.name);

    return {
      contact_id: c.id,
      name: c.name,
      email: c.email,
      title: c.title,
      is_primary: c.is_primary,
      company_id: c.company_id,
      company_name: c.companies?.name ?? null,
      properties,
    };
  });

out({ count: rows.length, contacts: rows });
