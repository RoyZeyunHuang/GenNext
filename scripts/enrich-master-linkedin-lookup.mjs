#!/usr/bin/env node
/**
 * 为 property_developer_contacts_MASTER 增加 linkedin_lookup_url：
 * 打开后为 LinkedIn「人物」搜索结果（关键词 = 姓名 + 公司），便于人工点开核对后把真实 /in/ 链接抄到 contact_linkedin。
 *
 * 不会自动写入 profile URL（无法保证不重名、不违规、不出错）。
 *
 * Run: node scripts/enrich-master-linkedin-lookup.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESEARCH = path.join(__dirname, "..", "research");
const BASE = "property_developer_contacts_MASTER";

function lookupUrl(name, developer) {
  const q = [name, developer].filter(Boolean).join(" ").trim();
  if (!q) return "";
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;
}

function googleLookupUrl(name, developer) {
  const q = `site:linkedin.com/in/ ${[name, developer].filter(Boolean).join(" ")}`.trim();
  if (!q.replace("site:linkedin.com/in/", "").trim()) return "";
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function main() {
  const xlsxPath = path.join(RESEARCH, `${BASE}.xlsx`);
  if (!fs.existsSync(xlsxPath)) {
    console.error("Missing", xlsxPath, "— run npm run research:consolidate-contacts first");
    process.exit(1);
  }
  const wb = XLSX.readFile(xlsxPath);
  const sh = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { defval: "" });

  const headers = [
    "property",
    "property_address",
    "developer",
    "developer_contact_name",
    "contact_title",
    "contact_email",
    "contact_linkedin",
    "linkedin_lookup_url",
    "google_linkedin_search_url",
    "source_file",
  ];

  const out = rows.map((r) => {
    const name = String(r.developer_contact_name || "").trim();
    const dev = String(r.developer || "").trim();
    const hasProfile = String(r.contact_linkedin || "").trim();
    return {
      property: r.property ?? "",
      property_address: r.property_address ?? "",
      developer: r.developer ?? "",
      developer_contact_name: r.developer_contact_name ?? "",
      contact_title: r.contact_title ?? "",
      contact_email: r.contact_email ?? "",
      contact_linkedin: r.contact_linkedin ?? "",
      linkedin_lookup_url: name && !hasProfile ? lookupUrl(name, dev) : "",
      google_linkedin_search_url: name && !hasProfile ? googleLookupUrl(name, dev) : "",
      source_file: r.source_file ?? "",
    };
  });

  const aoa = [headers, ...out.map((row) => headers.map((h) => row[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, "contacts");

  const outCsv = path.join(RESEARCH, `${BASE}.csv`);
  const outXlsx = path.join(RESEARCH, `${BASE}.xlsx`);
  XLSX.writeFile(wbOut, outCsv, { bookType: "csv" });
  XLSX.writeFile(wbOut, outXlsx, { bookType: "xlsx" });

  const withHint = out.filter((r) => r.linkedin_lookup_url).length;
  console.log("Updated", outCsv, "and", outXlsx);
  console.log("Rows with linkedin_lookup_url (has name, empty linkedin):", withHint);
}

main();
