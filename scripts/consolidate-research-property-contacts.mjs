#!/usr/bin/env node
/**
 * Merge research/*.csv and research/*.xlsx into one sheet:
 * property, property_address, developer, developer_contact_name, contact_title, contact_email, contact_linkedin, source_file
 *
 * Run: node scripts/consolidate-research-property-contacts.mjs
 * Then: npm run research:linkedin-lookup（为每人生成 LinkedIn/Google 查找链接列，便于人工核对后填 contact_linkedin）
 * Or: npm run research:master-full（两步一起）
 * Output: research/property_developer_contacts_MASTER.csv + .xlsx
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESEARCH = path.join(__dirname, "..", "research");

const OUT_BASE = "property_developer_contacts_MASTER";

function norm(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function keyPropDev(property, developer) {
  return `${norm(property).toLowerCase()}|${norm(developer).toLowerCase()}`;
}

function readSheetRows(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", raw: false });
  const sh = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sh], { defval: "" });
}

function extractFromObject(obj, sourceFile) {
  let property = norm(
    obj.property_name ||
      obj.Property ||
      obj.properties ||
      obj["Property Name"]
  );
  let property_address = norm(
    obj.address ||
      obj.Address ||
      obj.property_address ||
      obj["Property Address"]
  );
  const developer = norm(
    obj.developer_company ||
      obj["Developer Company"] ||
      obj.developer ||
      obj.Developer
  );
  const developer_contact_name = norm(
    obj.contact_name || obj.Name || obj["Contact Name"] || obj.contact
  );
  const contact_title = norm(obj.contact_title || obj.Title || obj["Contact Title"]);
  const contact_email = norm(
    obj.contact_email || obj["Inferred Email"] || obj.email || obj.Email
  );
  const contact_linkedin = norm(
    obj.linkedin || obj.LinkedIn || obj.contact_linkedin || obj.linkedin_url || obj["LinkedIn URL"]
  );

  // NJ sheets: "Properties" is a bundle of names
  if (!property && obj.Properties) {
    property = norm(obj.Properties);
  }

  return {
    property,
    property_address,
    developer,
    developer_contact_name,
    contact_title,
    contact_email,
    contact_linkedin,
    source_file: path.basename(sourceFile),
  };
}

function scoreRow(r) {
  let s = 0;
  if (r.property_address) s += 3;
  if (r.contact_email) s += 4;
  if (r.developer_contact_name) s += 2;
  if (r.contact_title) s += 1;
  if (r.contact_linkedin) s += 5;
  return s;
}

function mergeRows(a, b) {
  const useA = scoreRow(a) >= scoreRow(b);
  const pick = { ...(useA ? a : b) };
  const other = useA ? b : a;
  if (!pick.property_address && other.property_address) pick.property_address = other.property_address;
  if (!pick.contact_linkedin && other.contact_linkedin) pick.contact_linkedin = other.contact_linkedin;
  if (!pick.contact_email && other.contact_email) pick.contact_email = other.contact_email;
  if (!pick.contact_title && other.contact_title) pick.contact_title = other.contact_title;
  if (!pick.developer_contact_name && other.developer_contact_name) {
    pick.developer_contact_name = other.developer_contact_name;
  }
  // keep richer source_file hint
  pick.source_file = [pick.source_file, other.source_file].filter(Boolean).join("; ");
  return pick;
}

function main() {
  const files = fs.readdirSync(RESEARCH);
  const csvXlsx = files.filter((f) => /\.(csv|xlsx)$/i.test(f));
  /** @type {ReturnType<typeof extractFromObject>[]} */
  let rows = [];

  for (const f of csvXlsx) {
    if (f.startsWith(OUT_BASE)) continue;
    const fp = path.join(RESEARCH, f);
    let data;
    try {
      data = readSheetRows(fp);
    } catch (e) {
      console.warn("skip", f, e.message);
      continue;
    }
    for (const obj of data) {
      rows.push(extractFromObject(obj, fp));
    }
  }

  // Address lookup: any row with property + developer + address
  const addrMap = new Map();
  for (const r of rows) {
    if (r.property && r.developer && r.property_address) {
      const k = keyPropDev(r.property, r.developer);
      const cur = addrMap.get(k) || "";
      if (r.property_address.length > cur.length) addrMap.set(k, r.property_address);
    }
  }
  // Also map by property only (weaker)
  const addrByProp = new Map();
  for (const r of rows) {
    if (r.property && r.property_address) {
      const k = r.property.toLowerCase();
      const cur = addrByProp.get(k) || "";
      if (r.property_address.length > cur.length) addrByProp.set(k, r.property_address);
    }
  }

  for (const r of rows) {
    if (!r.property_address && r.property && r.developer) {
      const k = keyPropDev(r.property, r.developer);
      if (addrMap.has(k)) r.property_address = addrMap.get(k);
      else if (addrByProp.has(r.property.toLowerCase())) {
        r.property_address = addrByProp.get(r.property.toLowerCase());
      }
    }
  }

  // Dedupe: same property+dev+email+name
  const dedup = new Map();
  for (const r of rows) {
    const dk = [
      r.property.toLowerCase(),
      r.developer.toLowerCase(),
      r.contact_email.toLowerCase(),
      r.developer_contact_name.toLowerCase(),
    ].join("|");
    if (!r.property && !r.developer && !r.contact_email && !r.developer_contact_name) continue;
    if (dedup.has(dk)) {
      dedup.set(dk, mergeRows(dedup.get(dk), r));
    } else {
      dedup.set(dk, { ...r });
    }
  }

  const out = [...dedup.values()].sort((a, b) => {
    const c1 = a.property.localeCompare(b.property);
    if (c1) return c1;
    const c2 = a.developer.localeCompare(b.developer);
    if (c2) return c2;
    return a.developer_contact_name.localeCompare(b.developer_contact_name);
  });

  const headers = [
    "property",
    "property_address",
    "developer",
    "developer_contact_name",
    "contact_title",
    "contact_email",
    "contact_linkedin",
    "source_file",
  ];
  const aoa = [headers, ...out.map((r) => headers.map((h) => r[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "contacts");

  const outCsv = path.join(RESEARCH, `${OUT_BASE}.csv`);
  const outXlsx = path.join(RESEARCH, `${OUT_BASE}.xlsx`);
  XLSX.writeFile(wb, outCsv, { bookType: "csv" });
  XLSX.writeFile(wb, outXlsx, { bookType: "xlsx" });

  console.log("Wrote", outCsv);
  console.log("Wrote", outXlsx);
  console.log("Rows:", out.length);
}

main();
