/**
 * 审计：联系人邮箱域名是否与公司官网/公司邮箱域名一致。
 *
 * 规则摘要：
 * - 从 companies.website 解析 hostname（自动补 https://），去掉 www.，小写。
 * - 从 companies.email 提取域名；若为公共邮箱域名则不计入「公司域名」。
 * - 若公司没有任何「企业域名」，该司下联系人跳过（无法判断）。
 * - 若公司存在企业域名：联系人邮箱域名为公共邮箱（gmail 等）→ 不匹配；
 *   或非公共但与任一企业域名不一致（非相同根域、非其子域）→ 不匹配。
 *
 * 用法：
 *   node scripts/audit-contact-email-domain-mismatch.mjs              # 打印摘要并写入报告文件
 *   node scripts/audit-contact-email-domain-mismatch.mjs --json         # 仅 stdout JSON
 *   node scripts/audit-contact-email-domain-mismatch.mjs --execute --approved-file scripts/output/contact-domain-mismatch.approved.json
 *
 * approved.json 格式：{ "contactIds": ["uuid", ...] }  （仅删除你确认过的 id）
 *
 * 环境：项目根 .env.local → NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
]);

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("未找到 .env.local");
    process.exit(1);
  }
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
}

function extractEmailDomain(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at >= e.length - 1) return null;
  const domain = e.slice(at + 1).trim();
  if (!domain || domain.includes("@") || domain.includes(" ")) return null;
  return domain;
}

function normalizeHost(host) {
  if (!host) return null;
  return String(host)
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function hostFromWebsite(website) {
  const w = String(website || "").trim();
  if (!w) return null;
  let u = w;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const url = new URL(u);
    if (!url.hostname) return null;
    return normalizeHost(url.hostname);
  } catch {
    return null;
  }
}

/** @param {string} contactDomain */
/** @param {Set<string>} corporateDomains */
function domainMatchesCorporate(contactDomain, corporateDomains) {
  const cd = contactDomain.toLowerCase();
  for (const corp of corporateDomains) {
    const c = corp.toLowerCase();
    if (cd === c) return true;
    if (cd.endsWith("." + c)) return true;
  }
  return false;
}

/** 判断 small 的字符是否按顺序出现在 large 中（如 pmg → propertymg） */
function isOrderedSubsequence(small, large) {
  if (!small || !large) return false;
  let i = 0;
  for (let j = 0; j < large.length && i < small.length; j++) {
    if (large[j] === small[i]) i++;
  }
  return i === small.length;
}

/**
 * 公司无官网/无企业邮箱时：用公司名与邮箱域名的「主段」做弱匹配。
 * @param {string} companyName
 * @param {string} contactDomain
 */
function nameLooselyMatchesEmailDomain(companyName, contactDomain) {
  if (PUBLIC_EMAIL_DOMAINS.has(contactDomain.toLowerCase())) return false;
  const parts = contactDomain.toLowerCase().split(".");
  const main = parts[0] || "";
  if (main.length < 2) return false;

  const name = String(companyName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (name.length >= 2) {
    if (name.includes(main) && main.length >= 3) return true;
    if (main.length >= 4 && main.includes(name.slice(0, Math.min(12, name.length))) && name.length >= 4)
      return true;
  }

  const words = String(companyName || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  for (const w of words) {
    if (main.includes(w) || w.includes(main)) return true;
    if (w.length >= 5) {
      const pref4 = w.slice(0, 4);
      if (main.startsWith(pref4)) return true;
      const pref3 = w.slice(0, 3);
      if (pref3.length === 3 && main.startsWith(pref3)) return true;
    }
  }

  const compact = String(companyName || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (compact.length >= 2 && compact.length <= 8 && /^[a-z]+$/i.test(compact.replace(/[^a-z]/g, ""))) {
    if (isOrderedSubsequence(compact, main)) return true;
  }
  const tokens = String(companyName || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 1 && t.length <= 5);
  for (const t of tokens) {
    const letters = t.toLowerCase().replace(/[^a-z]/g, "");
    if (letters.length >= 2 && letters.length <= 6 && isOrderedSubsequence(letters, main)) return true;
  }

  const rawWords = String(companyName || "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (
    rawWords.length === 1 &&
    rawWords[0].length >= 2 &&
    rawWords[0].length <= 6 &&
    rawWords[0] === rawWords[0].toUpperCase()
  ) {
    const t = rawWords[0].toLowerCase();
    if (main.startsWith(t.slice(0, 2))) return true;
  }

  return false;
}

/** @param {string} companyId @param {{website?:string,email?:string}} co */
function buildCorporateDomains(co) {
  const set = new Set();
  const wh = hostFromWebsite(co.website);
  if (wh) set.add(wh);
  const ce = extractEmailDomain(co.email);
  if (ce && !PUBLIC_EMAIL_DOMAINS.has(ce)) set.add(ce);
  return set;
}

async function fetchAllCompanies(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, website, email")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchAllContacts(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, company_id, name, email, is_primary")
      .not("email", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all.filter((c) => String(c.email || "").trim().length > 0);
}

async function main() {
  const jsonOnly = process.argv.includes("--json");
  const execute = process.argv.includes("--execute");
  const approvedIdx = process.argv.findIndex((a) => a === "--approved-file");
  const approvedPath =
    approvedIdx >= 0 && process.argv[approvedIdx + 1]
      ? path.resolve(process.cwd(), process.argv[approvedIdx + 1])
      : null;

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  if (execute) {
    if (!approvedPath || !fs.existsSync(approvedPath)) {
      console.error("执行删除须提供 --approved-file <path>，且文件存在。");
      console.error('文件格式：{ "contactIds": ["uuid", ...] }');
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(approvedPath, "utf8"));
    const ids = Array.isArray(raw.contactIds) ? raw.contactIds.filter(Boolean) : [];
    if (!ids.length) {
      console.error("approved 文件中没有 contactIds");
      process.exit(1);
    }
    const { error, count } = await supabase.from("contacts").delete().in("id", ids);
    if (error) {
      console.error("删除失败:", error.message);
      process.exit(1);
    }
    console.log(`已请求删除 ${ids.length} 条联系人（若 RLS/权限限制请以 service role 重试）。`);
    process.exit(0);
  }

  const companies = await fetchAllCompanies(supabase);
  const byId = new Map(companies.map((c) => [c.id, c]));

  /** @type {Array<{contactId:string,companyId:string,companyName:string,contactName:string,contactEmail:string,contactDomain:string,reason:string,companyWebsite:string|null,companyEmail:string|null,corporateDomains:string[],matchBasis?:string,isPrimary?:boolean}>} */
  const mismatches = [];
  let skippedNoCorporate = 0;
  let skippedNoContactDomain = 0;
  let ok = 0;
  let okByNameHeuristic = 0;

  const contacts = await fetchAllContacts(supabase);
  for (const ct of contacts) {
    const co = byId.get(ct.company_id);
    if (!co) continue;
    const corp = buildCorporateDomains(co);
    const cd = extractEmailDomain(ct.email);
    if (!cd) {
      skippedNoContactDomain++;
      continue;
    }
    const corpArr = [...corp];
    if (corp.size === 0) {
      if (PUBLIC_EMAIL_DOMAINS.has(cd)) {
        skippedNoCorporate++;
        continue;
      }
      if (nameLooselyMatchesEmailDomain(co.name || "", cd)) {
        okByNameHeuristic++;
        ok++;
        continue;
      }
      mismatches.push({
        contactId: ct.id,
        companyId: co.id,
        companyName: co.name || "",
        contactName: ct.name || "",
        contactEmail: String(ct.email).trim(),
        contactDomain: cd,
        reason: "公司无官网/无企业邮箱，且邮箱域名与公司名称无明显关联",
        companyWebsite: co.website ?? null,
        companyEmail: co.email ?? null,
        corporateDomains: [],
        matchBasis: "none",
        isPrimary: !!ct.is_primary,
      });
      continue;
    }
    if (PUBLIC_EMAIL_DOMAINS.has(cd)) {
      mismatches.push({
        contactId: ct.id,
        companyId: co.id,
        companyName: co.name || "",
        contactName: ct.name || "",
        contactEmail: String(ct.email).trim(),
        contactDomain: cd,
        reason: "公共邮箱域名，与公司企业域名不一致",
        companyWebsite: co.website ?? null,
        companyEmail: co.email ?? null,
        corporateDomains: corpArr,
        matchBasis: "corporate_domain",
        isPrimary: !!ct.is_primary,
      });
      continue;
    }
    if (!domainMatchesCorporate(cd, corp)) {
      mismatches.push({
        contactId: ct.id,
        companyId: co.id,
        companyName: co.name || "",
        contactName: ct.name || "",
        contactEmail: String(ct.email).trim(),
        contactDomain: cd,
        reason: "邮箱域名与公司官网/公司邮箱域名不一致",
        companyWebsite: co.website ?? null,
        companyEmail: co.email ?? null,
        corporateDomains: corpArr,
        matchBasis: "corporate_domain",
        isPrimary: !!ct.is_primary,
      });
      continue;
    }
    ok++;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      contactsScanned: contacts.length,
      ok,
      okByCorporateDomain: ok - okByNameHeuristic,
      okByNameHeuristicWhenNoCompanyDomain: okByNameHeuristic,
      mismatch: mismatches.length,
      skippedNoCompanyDataPublicContactEmail: skippedNoCorporate,
      skippedContactInvalidEmail: skippedNoContactDomain,
    },
    mismatches,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const outDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "contact-domain-mismatch-report.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log("=== 联系人邮箱域名审计 ===\n");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`\n完整报告已写入: ${outFile}`);
  console.log(
    "\n确认要删除的记录后，请新建 scripts/output/contact-domain-mismatch.approved.json：\n" +
      '  { "contactIds": ["<只保留你要删的 uuid>", ...] }\n' +
      "然后执行:\n" +
      "  node scripts/audit-contact-email-domain-mismatch.mjs --execute --approved-file scripts/output/contact-domain-mismatch.approved.json\n"
  );

  const preview = mismatches.slice(0, 40);
  if (preview.length) {
    console.log("\n--- 前 40 条不匹配预览 ---\n");
    for (const m of preview) {
      console.log(
        `- ${m.companyName} | ${m.contactName} <${m.contactEmail}> | 域=${m.contactDomain} | 公司域=[${m.corporateDomains.join(", ")}] | ${m.reason}${m.isPrimary ? " | ⚠主联系人" : ""}`
      );
    }
    if (mismatches.length > 40) console.log(`\n... 另有 ${mismatches.length - 40} 条见 JSON`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
