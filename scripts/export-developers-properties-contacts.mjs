import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in env.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE_SIZE = 1000;
const outputPath = "exports/developers_properties_contacts.csv";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // CSV: escape double quotes and wrap if needed.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllPropertyCompanies() {
  const all = [];
  let start = 0;
  while (true) {
    const { data, error } = await supabase
      .from("property_companies")
      .select("role, company_id, companies(name), property_id, properties(name)")
      .eq("role", "developer")
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return all;
}

async function fetchContactsByCompanyIds(companyIds) {
  const all = [];
  const batches = chunkArray(companyIds, 500);
  for (const ids of batches) {
    const { data, error } = await supabase
      .from("contacts")
      .select("company_id, name, email, is_primary, created_at")
      .in("company_id", ids);
    if (error) throw error;
    all.push(...(Array.isArray(data) ? data : []));
  }
  return all;
}

function pickContact(contacts) {
  const valid = contacts
    .filter((c) => c.email != null && String(c.email).trim() !== "")
    .map((c) => ({
      name: c.name,
      email: c.email,
      is_primary: Boolean(c.is_primary),
      created_at: c.created_at ? new Date(c.created_at).getTime() : Number.POSITIVE_INFINITY,
    }));
  valid.sort((a, b) => {
    // is_primary desc, created_at asc
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.created_at - b.created_at;
  });
  return valid[0] ?? { name: "", email: "" };
}

function toCsv(rows) {
  const header = ["developer", "property", "contact_name", "contact_email"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.developer, r.property, r.contact_name, r.contact_email].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

async function main() {
  const propertyCompanies = await fetchAllPropertyCompanies();
  const companyIds = Array.from(new Set(propertyCompanies.map((r) => r.company_id)));

  const contacts = await fetchContactsByCompanyIds(companyIds);
  const contactsByCompanyId = new Map();
  for (const c of contacts) {
    const list = contactsByCompanyId.get(c.company_id) ?? [];
    list.push(c);
    contactsByCompanyId.set(c.company_id, list);
  }

  const exportRows = propertyCompanies
    .filter((pc) => pc.companies?.name && pc.properties?.name)
    .map((pc) => {
      return {
        developer: pc.companies.name,
        property: pc.properties.name,
        ...(function () {
          const chosen = pickContact(contactsByCompanyId.get(pc.company_id) ?? []);
          return {
            contact_name: chosen.name ?? "",
            contact_email: chosen.email ?? "",
          };
        })(),
      };
    });

  const csv = toCsv(exportRows);
  fs.writeFileSync(outputPath, csv, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        rows: exportRows.length,
        developerCompanies: companyIds.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

