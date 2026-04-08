/**
 * Merge research/* contact rows into research/contacts_consolidated.csv
 * Columns: source_file, developer_company, property_name, contact_name, contact_title, contact_email, email_confidence, linkedin
 *
 * Run: node scripts/consolidate-research-contacts.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESEARCH = path.join(__dirname, "..", "research");
const OUT = path.join(RESEARCH, "contacts_consolidated.csv");

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if ((c === "," && !q) || c === "\r") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function readCSV(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\n/).filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

function norm(s) {
  if (s == null) return "";
  return String(s).trim();
}

function looksLikeEmail(s) {
  const t = norm(s);
  if (!t || !t.includes("@")) return false;
  if (/domain|estimated|property email/i.test(t) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.replace(/^mailto:/i, ""));
}

function normalizeEmail(s) {
  const t = norm(s).replace(/^mailto:/i, "");
  return looksLikeEmail(t) ? t.toLowerCase() : "";
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && norm(obj[k]) !== "") return norm(obj[k]);
  }
  return "";
}

/** @type {Array<Record<string, string>>} */
const merged = [];

function addRow(sourceFile, rec) {
  const contact_name = pick(rec, ["contact_name", "Name", "name"]);
  const contact_email = normalizeEmail(pick(rec, ["contact_email", "Inferred Email", "email", "Email"]));
  if (!contact_name && !contact_email) return;

  merged.push({
    source_file: sourceFile,
    developer_company: pick(rec, ["developer_company", "Developer Company"]),
    property_name: pick(rec, ["property_name", "Properties", "property"]),
    contact_name,
    contact_title: pick(rec, ["contact_title", "Title", "title"]),
    contact_email,
    email_confidence: pick(rec, ["email_confidence", "Confidence"]),
    linkedin: pick(rec, ["linkedin", "linkedin_url", "LinkedIn", "linkedin profile"]),
  });
}

const csvFiles = [
  "nyc_luxury_rentals_brooklyn_newark.csv",
  "nyc_luxury_rentals_goldcoast_nj.csv",
  "nyc_luxury_rentals_MASTER.csv",
  "email_pitch_final_with_contacts.csv",
  "nyc_luxury_rentals_300.csv",
];

for (const fn of csvFiles) {
  const fp = path.join(RESEARCH, fn);
  if (!fs.existsSync(fp)) continue;
  const { rows } = readCSV(fp);
  for (const row of rows) addRow(fn, row);
}

function readXlsxRows(filePath, sheetPick) {
  const wb = XLSX.readFile(filePath);
  const sheetName = typeof sheetPick === "string" ? sheetPick : wb.SheetNames[0];
  const sh = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sh, { defval: "" });
}

const xlsxJobs = [
  ["nj_developer_inferred_emails.xlsx", "Inferred Emails"],
  ["nj_developer_inferred_emails_v3.xlsx", "Sheet1"],
  ["email_pitch_targets.xlsx", "Email Pitch Targets"],
];

for (const [fn, sheet] of xlsxJobs) {
  const fp = path.join(RESEARCH, fn);
  if (!fs.existsSync(fp)) continue;
  const rows = readXlsxRows(fp, sheet);
  for (const row of rows) addRow(fn, row);
}

// Dedupe: email primary; else name + developer + property
const seen = new Set();
const deduped = [];
for (const r of merged) {
  const e = r.contact_email.toLowerCase();
  const key = e || `${r.contact_name.toLowerCase()}|${r.developer_company.toLowerCase()}|${r.property_name.toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(r);
}

// CSV escape
function esc(f) {
  const s = f == null ? "" : String(f);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const headers = [
  "contact_name",
  "contact_email",
  "linkedin",
  "contact_title",
  "developer_company",
  "property_name",
  "source_file",
  "email_confidence",
];

const linesOut = [headers.join(",")];
for (const r of deduped) {
  linesOut.push(headers.map((h) => esc(r[h] ?? "")).join(","));
}

fs.writeFileSync(OUT, linesOut.join("\n") + "\n", "utf8");

console.log(`Wrote ${deduped.length} unique contacts → ${OUT}`);
