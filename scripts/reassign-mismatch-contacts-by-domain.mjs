/**
 * 将「域名与当前公司不一致」的联系人，尝试迁到邮箱域名对应的公司。
 *
 * 匹配优先级：
 * 1) 高：目标公司的 website / 非公共 companies.email 所推导的企业域名 ⊇ 联系人邮箱域名
 * 2) 中：公司名压缩串与域名主段强对齐（strictNameDomainAlign）
 * 3) 低：公司 name 包含域名主段（主段长度 ≥ 4，且非公共邮箱域）
 *
 * 排除当前所属公司；若命中多家则记入 ambiguous；若目标公司已存在相同邮箱则 duplicateConflict。
 *
 * 用法：
 *   node scripts/reassign-mismatch-contacts-by-domain.mjs
 *   node scripts/reassign-mismatch-contacts-by-domain.mjs --report scripts/output/contact-domain-mismatch-report.json
 *   node scripts/reassign-mismatch-contacts-by-domain.mjs --execute --plan scripts/output/contact-reassign-plan.json
 *
 * 执行前请人工检查 plan；也可编辑 plan 只保留要执行的 proposals（脚本会跳过无 toCompanyId 的项）。
 *
 * 环境：.env.local → NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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
  if (!domain || domain.includes("@")) return null;
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

function domainMatchesCorporate(contactDomain, corporateDomains) {
  const cd = contactDomain.toLowerCase();
  for (const corp of corporateDomains) {
    const c = corp.toLowerCase();
    if (cd === c) return true;
    if (cd.endsWith("." + c)) return true;
  }
  return false;
}

function buildCorporateDomains(co) {
  const set = new Set();
  const wh = hostFromWebsite(co.website);
  if (wh) set.add(wh);
  const ce = extractEmailDomain(co.email);
  if (ce && !PUBLIC_EMAIL_DOMAINS.has(ce)) set.add(ce);
  return set;
}

/**
 * 公司全名去标点压缩串 与 域名主段（去标点）强对齐，避免仅因单词 the/marketing 等误匹配多家。
 */
function strictNameDomainAlign(companyName, contactDomain) {
  if (PUBLIC_EMAIL_DOMAINS.has(contactDomain.toLowerCase())) return false;
  const main = contactDomain
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const comp = String(companyName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (main.length < 3 || comp.length < 3) return false;
  if (main.length <= 5 && (comp.startsWith(main) || comp.includes(main))) return true;
  if (main.length < 5 || comp.length < 4) return false;
  if (main === comp) return true;
  if (comp.length >= 8 && main.includes(comp)) return true;
  if (main.length >= 8 && comp.includes(main)) return true;
  if (comp.length >= 6 && main.startsWith(comp)) return true;
  if (main.length >= 8 && comp.startsWith(main.slice(0, Math.min(14, main.length)))) return true;
  const dm = main.slice(0, Math.min(12, main.length));
  if (dm.length >= 6 && comp.includes(dm)) return true;
  return false;
}

function nameContainsDomainMain(companyName, contactDomain) {
  if (PUBLIC_EMAIL_DOMAINS.has(contactDomain.toLowerCase())) return false;
  const main = contactDomain.split(".")[0].toLowerCase();
  if (main.length < 5) return false;
  return String(companyName || "")
    .toLowerCase()
    .includes(main);
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

/**
 * @returns {{ target: {id,name} | null, method: string, candidates: {id,name,method}[], ambiguous: boolean }}
 */
function resolveTargetCompany(contactDomain, currentCompanyId, companies) {
  const tier1 = [];
  for (const co of companies) {
    if (co.id === currentCompanyId) continue;
    const corp = buildCorporateDomains(co);
    if (corp.size === 0) continue;
    if (domainMatchesCorporate(contactDomain, corp)) {
      tier1.push({ id: co.id, name: co.name || "", method: "corporate_domain" });
    }
  }
  if (tier1.length === 1) {
    return { target: tier1[0], method: "corporate_domain", candidates: tier1, ambiguous: false };
  }
  if (tier1.length > 1) {
    return { target: null, method: "corporate_domain", candidates: tier1, ambiguous: true };
  }

  const tier2 = [];
  for (const co of companies) {
    if (co.id === currentCompanyId) continue;
    if (strictNameDomainAlign(co.name || "", contactDomain)) {
      tier2.push({ id: co.id, name: co.name || "", method: "name_align" });
    }
  }
  if (tier2.length === 1) {
    return { target: tier2[0], method: "name_align", candidates: tier2, ambiguous: false };
  }
  if (tier2.length > 1) {
    return { target: null, method: "name_align", candidates: tier2, ambiguous: true };
  }

  const tier3 = [];
  for (const co of companies) {
    if (co.id === currentCompanyId) continue;
    if (nameContainsDomainMain(co.name || "", contactDomain)) {
      tier3.push({ id: co.id, name: co.name || "", method: "name_substring" });
    }
  }
  if (tier3.length === 1) {
    return { target: tier3[0], method: "name_substring", candidates: tier3, ambiguous: false };
  }
  if (tier3.length > 1) {
    return { target: null, method: "name_substring", candidates: tier3, ambiguous: true };
  }

  return { target: null, method: "none", candidates: [], ambiguous: false };
}

async function emailExistsAtCompany(supabase, companyId, email) {
  const norm = String(email || "").trim().toLowerCase();
  if (!norm) return false;
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("company_id", companyId)
    .ilike("email", norm);
  if (error) throw error;
  return (data || []).length > 0;
}

async function main() {
  const reportIdx = process.argv.indexOf("--report");
  const reportPath =
    reportIdx >= 0 && process.argv[reportIdx + 1]
      ? path.resolve(process.cwd(), process.argv[reportIdx + 1])
      : path.join(process.cwd(), "scripts", "output", "contact-domain-mismatch-report.json");

  const execute = process.argv.includes("--execute");
  const planIdx = process.argv.indexOf("--plan");
  const planPath =
    planIdx >= 0 && process.argv[planIdx + 1]
      ? path.resolve(process.cwd(), process.argv[planIdx + 1])
      : path.join(process.cwd(), "scripts", "output", "contact-reassign-plan.json");

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("缺少 Supabase 环境变量");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  if (execute) {
    if (!fs.existsSync(planPath)) {
      console.error("缺少 plan 文件:", planPath);
      process.exit(1);
    }
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    const proposals = plan.proposals || [];
    let ok = 0;
    let fail = 0;
    for (const p of proposals) {
      if (!p.toCompanyId || !p.contactId) continue;
      if (p.duplicateConflict) {
        console.warn("跳过（重复邮箱）:", p.contactEmail, p.toCompanyName);
        fail++;
        continue;
      }
      if (p.ambiguous) continue;
      const { error } = await supabase
        .from("contacts")
        .update({ company_id: p.toCompanyId })
        .eq("id", p.contactId);
      if (error) {
        console.error("更新失败", p.contactId, error.message);
        fail++;
      } else {
        ok++;
        console.log("已迁移:", p.contactEmail, "→", p.toCompanyName);
      }
    }
    console.log(`\n完成: 成功 ${ok}, 失败/跳过 ${fail}`);
    process.exit(0);
  }

  if (!fs.existsSync(reportPath)) {
    console.error("未找到 mismatch 报告:", reportPath);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const mismatches = report.mismatches || [];
  const companies = await fetchAllCompanies(supabase);

  /** @type {any[]} */
  const proposals = [];
  /** @type {any[]} */
  const ambiguousRows = [];
  /** @type {any[]} */
  const unmatched = [];

  for (const m of mismatches) {
    const contactDomain = m.contactDomain;
    const currentId = m.companyId;
    if (!contactDomain || PUBLIC_EMAIL_DOMAINS.has(contactDomain.toLowerCase())) {
      unmatched.push({ ...m, reason: "公共邮箱或无效域名" });
      continue;
    }

    const resolved = resolveTargetCompany(contactDomain, currentId, companies);

    if (resolved.ambiguous) {
      ambiguousRows.push({
        contactId: m.contactId,
        contactEmail: m.contactEmail,
        contactName: m.contactName,
        currentCompanyId: currentId,
        currentCompanyName: m.companyName,
        contactDomain,
        method: resolved.method,
        candidates: resolved.candidates,
      });
      proposals.push({
        contactId: m.contactId,
        contactName: m.contactName,
        contactEmail: m.contactEmail,
        fromCompanyId: currentId,
        fromCompanyName: m.companyName,
        toCompanyId: null,
        toCompanyName: null,
        confidence: "ambiguous",
        method: resolved.method,
        ambiguous: true,
        candidates: resolved.candidates,
        duplicateConflict: false,
      });
      continue;
    }

    if (!resolved.target) {
      unmatched.push({ ...m, reason: "未找到域名/名称对应的公司" });
      proposals.push({
        contactId: m.contactId,
        contactName: m.contactName,
        contactEmail: m.contactEmail,
        fromCompanyId: currentId,
        fromCompanyName: m.companyName,
        toCompanyId: null,
        toCompanyName: null,
        confidence: "none",
        method: "none",
        ambiguous: false,
        duplicateConflict: false,
      });
      continue;
    }

    let duplicateConflict = false;
    try {
      duplicateConflict = await emailExistsAtCompany(supabase, resolved.target.id, m.contactEmail);
    } catch (e) {
      console.error("检查重复邮箱失败", e);
    }

    const confidence =
      resolved.method === "corporate_domain" ? "high" : resolved.method === "name_align" ? "medium" : "low";

    proposals.push({
      contactId: m.contactId,
      contactName: m.contactName,
      contactEmail: m.contactEmail,
      fromCompanyId: currentId,
      fromCompanyName: m.companyName,
      toCompanyId: resolved.target.id,
      toCompanyName: resolved.target.name,
      confidence,
      method: resolved.method,
      ambiguous: false,
      duplicateConflict,
    });
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    sourceReport: reportPath,
    summary: {
      fromMismatches: mismatches.length,
      readyToReassign: proposals.filter((p) => p.toCompanyId && !p.duplicateConflict && !p.ambiguous).length,
      ambiguous: ambiguousRows.length,
      unmatched: unmatched.length,
      duplicateConflict: proposals.filter((p) => p.duplicateConflict).length,
    },
    proposals,
    ambiguous: ambiguousRows,
    unmatched,
  };

  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf8");

  console.log("=== 联系人 → 公司 迁移计划 ===\n");
  console.log(JSON.stringify(plan.summary, null, 2));
  console.log(`\n完整计划: ${planPath}`);
  console.log(
    "\n请人工核对 proposals；可删除不信任的行或清空 toCompanyId 以跳过。\n确认后执行:\n" +
      `  node scripts/reassign-mismatch-contacts-by-domain.mjs --execute --plan ${path.relative(process.cwd(), planPath) || planPath}\n`
  );

  const ready = proposals.filter((p) => p.toCompanyId && !p.duplicateConflict && !p.ambiguous);
  if (ready.length) {
    console.log("\n--- 将自动迁移（高/中/低置信度且无重复）---\n");
    for (const p of ready) {
      console.log(
        `${p.contactEmail}  ${p.fromCompanyName} → ${p.toCompanyName}  [${p.confidence}/${p.method}]`
      );
    }
  }
  if (ambiguousRows.length) {
    console.log("\n--- 多家公司命中，需手动选 ---\n");
    for (const a of ambiguousRows.slice(0, 15)) {
      console.log(a.contactEmail, "候选:", a.candidates.map((c) => c.name).join(" | "));
    }
  }
  if (unmatched.length) {
    console.log("\n--- 未匹配 ---\n");
    for (const u of unmatched) {
      console.log(u.contactEmail || u.contactId, u.reason || u.contactDomain);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
