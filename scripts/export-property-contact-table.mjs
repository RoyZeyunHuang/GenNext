#!/usr/bin/env node
/**
 * research/property_developer_contacts_MASTER.csv → property_developer_contacts_export_table.csv
 *
 * 列 contact email sent：
 * - 默认（能连上 Supabase）：以库表 `emails` 中 direction=sent 为准（与你在应用里发信、Resend 同步的是同一批记录）。
 *   - 严格：CSV 行「楼盘名」规范化后与 `properties.name` 一致，且该行 contact_email 与 `to_email` 一致（均忽略大小写/空白）。
 *   - 宽松：若严格未命中，但该邮箱在任意一条 sent 记录里出现过，仍标 yes（楼盘名在库与 CSV 不一致时仍可命中）。
 * - 无 .env / 查询失败：回退到 dataAnalysis/email_batch_1 与楼盘名精确匹配（旧逻辑），并在 stderr 打警告。
 *
 * 列 email opened（yes/no）：库表 emails 中 direction=sent 且（opened_at 非空 或 status=opened）；
 *   匹配规则与「已发」一致（严格 property|email，宽松则任意发往该邮箱的打开即算）。
 *
 * 环境：项目根 .env.local → NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * 用法：node scripts/export-property-contact-table.mjs
 *       node scripts/export-property-contact-table.mjs --batch-only   # 仅用 batch 名单（调试用）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const masterPath = path.join(root, "research/property_developer_contacts_MASTER.csv");
const batchPath = path.join(root, "dataAnalysis/email_batch_1");
const outPath = path.join(root, "research/property_developer_contacts_export_table.csv");

const batchOnly = process.argv.includes("--batch-only");

function loadEnvLocal() {
  const envPath = path.resolve(root, ".env.local");
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
    process.env[key] = val;
  }
  return true;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function escCell(s) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function normProp(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normEmailAddr(s) {
  const t = String(s ?? "")
    .trim()
    .toLowerCase();
  return t || "";
}

function rowIsOpened(r) {
  if (r.opened_at) return true;
  const s = String(r.status ?? "")
    .trim()
    .toLowerCase();
  return s === "opened";
}

async function loadSentSetsFromSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);

  const { data: props, error: pErr } = await supabase.from("properties").select("id,name");
  if (pErr) throw new Error(pErr.message);
  const idToPropName = new Map(
    (props ?? []).map((r) => [String(r.id), String(r.name ?? "").trim()])
  );

  const strictKeys = new Set();
  const looseEmails = new Set();
  const strictOpenKeys = new Set();
  const looseOpenEmails = new Set();
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data: rows, error: eErr } = await supabase
      .from("emails")
      .select("property_id,to_email,opened_at,status")
      .eq("direction", "sent")
      .range(offset, offset + pageSize - 1);

    if (eErr) throw new Error(eErr.message);
    const batch = rows ?? [];
    if (batch.length === 0) break;

    for (const r of batch) {
      const to = normEmailAddr(r.to_email);
      if (!to) continue;
      looseEmails.add(to);
      const opened = rowIsOpened(r);
      if (opened) looseOpenEmails.add(to);
      const pid = r.property_id;
      if (!pid) continue;
      const pname = idToPropName.get(String(pid));
      if (!pname) continue;
      const sk = `${normProp(pname)}|${to}`;
      strictKeys.add(sk);
      if (opened) strictOpenKeys.add(sk);
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return { strictKeys, looseEmails, strictOpenKeys, looseOpenEmails };
}

function readBatchSet() {
  if (!fs.existsSync(batchPath)) return new Set();
  return new Set(
    fs
      .readFileSync(batchPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => normProp(l))
  );
}

async function main() {
  const masterRaw = fs.readFileSync(masterPath, "utf8").replace(/^\uFEFF/, "");
  const lines = masterRaw.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const batchSet = readBatchSet();

  let strictKeys = new Set();
  let looseEmails = new Set();
  let strictOpenKeys = new Set();
  let looseOpenEmails = new Set();
  let dbMode = false;

  if (!batchOnly) {
    loadEnvLocal();
    try {
      const sets = await loadSentSetsFromSupabase();
      if (sets) {
        strictKeys = sets.strictKeys;
        looseEmails = sets.looseEmails;
        strictOpenKeys = sets.strictOpenKeys;
        looseOpenEmails = sets.looseOpenEmails;
        dbMode = true;
        console.error(
          `[export] Supabase: sent 严格键 ${strictKeys.size} 个，宽松邮箱 ${looseEmails.size} 个；opened 严格键 ${strictOpenKeys.size} 个，宽松邮箱 ${looseOpenEmails.size} 个`
        );
      } else {
        console.error("[export] 未配置 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY，改用 email_batch_1 回退");
      }
    } catch (e) {
      console.error("[export] Supabase 查询失败，改用 email_batch_1 回退:", e instanceof Error ? e.message : e);
    }
  } else {
    console.error("[export] --batch-only：仅用 dataAnalysis/email_batch_1");
  }

  function linkedinForRow(cols) {
    const prof = (cols[idx.contact_linkedin] || "").trim();
    if (prof) return prof;
    return (cols[idx.linkedin_lookup_url] || "").trim();
  }

  function sentForRow(property, contactEmail) {
    const p = normProp(property);
    const em = normEmailAddr(contactEmail);
    if (dbMode) {
      if (em) {
        if (strictKeys.has(`${p}|${em}`)) return "yes";
        if (looseEmails.has(em)) return "yes";
      }
      return "no";
    }
    return batchSet.has(p) ? "yes" : "no";
  }

  function openedForRow(property, contactEmail) {
    const p = normProp(property);
    const em = normEmailAddr(contactEmail);
    if (!em) return "no";
    if (dbMode) {
      if (strictOpenKeys.has(`${p}|${em}`)) return "yes";
      if (looseOpenEmails.has(em)) return "yes";
      return "no";
    }
    return "no";
  }

  const outHeader = [
    "property",
    "developer",
    "contact name",
    "contact title",
    "contact email sent",
    "email opened",
    "contact linkedin",
  ];

  const outRows = [outHeader.join(",")];
  let yesCount = 0;
  let openCount = 0;

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    if (cols.length < header.length) continue;
    const property = (cols[idx.property] || "").trim();
    const developer = (cols[idx.developer] || "").trim();
    const contactName = (cols[idx.developer_contact_name] || "").trim();
    const contactTitle = (cols[idx.contact_title] || "").trim();
    const contactEmail = (cols[idx.contact_email] || "").trim();
    const sent = sentForRow(property, contactEmail);
    const opened = openedForRow(property, contactEmail);
    if (sent === "yes") yesCount++;
    if (opened === "yes") openCount++;
    const linkedin = linkedinForRow(cols);
    outRows.push(
      [
        escCell(property),
        escCell(developer),
        escCell(contactName),
        escCell(contactTitle),
        sent,
        opened,
        escCell(linkedin),
      ].join(",")
    );
  }

  fs.writeFileSync(outPath, outRows.join("\n") + "\n", "utf8");
  console.log(
    "Wrote",
    outPath,
    "data rows:",
    outRows.length - 1,
    "| contact email sent=yes:",
    yesCount,
    "| email opened=yes:",
    openCount
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
