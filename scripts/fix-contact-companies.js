/**
 * 按邮箱域名统一联系人所属公司；去重邮箱；TRIM 邮箱。
 *
 *   node scripts/fix-contact-companies.js --dry-run   # 仅预览
 *   node scripts/fix-contact-companies.js --execute   # 执行
 *
 * 环境：项目根目录 .env.local → NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const EXECUTE = process.argv.includes("--execute");

if (!DRY_RUN && !EXECUTE) {
  console.error("用法: node scripts/fix-contact-companies.js --dry-run | --execute");
  process.exit(1);
}
if (DRY_RUN && EXECUTE) {
  console.error("不能同时使用 --dry-run 与 --execute");
  process.exit(1);
}

/** 公共邮箱：不合并公司（避免把 @gmail.com 等混在一起） */
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
  const fs = require("fs");
  if (!fs.existsSync(envPath)) {
    console.error("未找到 .env.local，请在项目根目录运行");
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

/**
 * @param {string} email
 * @returns {string|null}
 */
function extractDomain(email) {
  const e = String(email || "")
    .replace(/^[\s\t]+|[\s\t]+$/g, "")
    .toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at >= e.length - 1) return null;
  const domain = e.slice(at + 1).trim();
  if (!domain || domain.includes("@") || domain.includes(" ")) return null;
  return domain;
}

/**
 * @param {string} domain
 * @param {string} companyName
 */
function domainCompanyMatchScore(domain, companyName) {
  const name = (companyName || "").toLowerCase();
  if (!name) return 0;
  const segments = domain.split(".").filter((s) => s.length > 0);
  let score = 0;
  for (const seg of segments) {
    if (seg.length < 2) continue;
    if (["com", "net", "org", "co", "io", "us", "uk", "nyc"].includes(seg)) continue;
    if (name.includes(seg)) score += 15;
  }
  const base = segments[0] || "";
  if (base.length >= 2 && name.includes(base)) score += 35;
  return score;
}

/**
 * @param {string} domain
 */
function prettyCompanyNameFromDomain(domain) {
  const base = domain.split(".")[0] || domain;
  const words = base.replace(/[-_]/g, " ").trim();
  if (!words) return domain;
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

function loadEnvAndClient() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }
  return createClient(url, key);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function fetchAllContacts(supabase) {
  const pageSize = 1000;
  let from = 0;
  /** @type {any[]} */
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, email, company_id, name, created_at")
      .not("email", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all.filter((c) => String(c.email || "").replace(/^[\s\t]+|[\s\t]+$/g, "").length > 0);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function fetchCompaniesMap(supabase) {
  const { data, error } = await supabase.from("companies").select("id, name");
  if (error) throw error;
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const row of data || []) {
    m.set(row.id, row.name || "—");
  }
  return m;
}

function escapeIlike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * 按名称模糊匹配，优先完全匹配，再选域名匹配分最高者。
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} domain
 * @param {string} pretty
 */
async function findCompanyByPrettyName(supabase, domain, pretty) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .ilike("name", `%${escapeIlike(pretty)}%`)
    .limit(20);
  if (error) throw error;
  const rows = data || [];
  const exact = rows.find((r) => (r.name || "").toLowerCase() === pretty.toLowerCase());
  if (exact) return exact;
  let best = null;
  let bestScore = -1;
  for (const r of rows) {
    const s = domainCompanyMatchScore(domain, r.name || "");
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return bestScore > 0 ? best : null;
}

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function main() {
  const supabase = loadEnvAndClient();

  let trimCount = 0;
  let duplicateDeletes = 0;
  let domainFixCount = 0;
  let domainsOk = 0;
  let domainsNeedFix = 0;
  let newCompanies = 0;
  /** @type {string[]} */
  const trimPreview = [];

  /** ---------- 1) TRIM 邮箱 ---------- */
  const contactsBefore = await fetchAllContacts(supabase);
  for (const c of contactsBefore) {
    const raw = String(c.email);
    const t = raw.replace(/^[\s\t]+|[\s\t]+$/g, "");
    if (t !== raw) {
      trimCount++;
      if (trimPreview.length < 15) trimPreview.push(`  TRIM: ${JSON.stringify(raw)} → ${JSON.stringify(t)}`);
    }
  }

  if (EXECUTE && trimCount > 0) {
    for (const c of contactsBefore) {
      const raw = String(c.email);
      const t = raw.replace(/^[\s\t]+|[\s\t]+$/g, "");
      if (t !== raw) {
        const { error } = await supabase.from("contacts").update({ email: t }).eq("id", c.id);
        if (error) throw error;
      }
    }
    console.log(`已 TRIM ${trimCount} 条邮箱。\n`);
  } else if (DRY_RUN && trimCount > 0) {
    console.log(`[预览] 将 TRIM ${trimCount} 条邮箱（首尾空格/tab）`);
    console.log(trimPreview.join("\n"));
    if (trimCount > trimPreview.length) console.log(`  ... 另有 ${trimCount - trimPreview.length} 条`);
    console.log("");
  }

  /** ---------- 2) 重复邮箱：保留 created_at 最新，删其余 ---------- */
  let contacts = EXECUTE ? await fetchAllContacts(supabase) : contactsBefore.map((c) => ({
    ...c,
    email: String(c.email).replace(/^[\s\t]+|[\s\t]+$/g, ""),
  }));

  /** @type {Map<string, any[]>} */
  const byEmail = new Map();
  for (const c of contacts) {
    const key = String(c.email || "")
      .replace(/^[\s\t]+|[\s\t]+$/g, "")
      .toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(c);
  }

  /** @type {Array<{ keep: any; remove: any[] }>} */
  const dupGroups = [];
  for (const [, list] of byEmail) {
    if (list.length <= 1) continue;
    const sorted = [...list].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
    const keep = sorted[0];
    const remove = sorted.slice(1);
    dupGroups.push({ keep, remove });
    duplicateDeletes += remove.length;
  }

  if (DRY_RUN && dupGroups.length > 0) {
    console.log(`[预览] 重复邮箱：${dupGroups.length} 组，将删除 ${duplicateDeletes} 条重复记录（保留最新 created_at）\n`);
    for (const { keep, remove } of dupGroups.slice(0, 8)) {
      console.log(`  保留: ${keep.name} <${keep.email}> id=${keep.id}`);
      for (const r of remove) {
        console.log(`  删除: ${r.name} <${r.email}> id=${r.id}`);
      }
    }
    if (dupGroups.length > 8) console.log(`  ... 另有 ${dupGroups.length - 8} 组\n`);
    else console.log("");
  }

  if (EXECUTE && dupGroups.length > 0) {
    for (const { remove } of dupGroups) {
      for (const r of remove) {
        const { error } = await supabase.from("contacts").delete().eq("id", r.id);
        if (error) throw error;
      }
    }
    console.log(`已删除 ${duplicateDeletes} 条重复联系人（保留每组最新）。\n`);
    contacts = await fetchAllContacts(supabase);
  }

  /** dry-run：域名分析按去重后联系人（与同邮箱多条只保留最新一条一致） */
  let contactsForDomain = contacts;
  if (DRY_RUN && dupGroups.length > 0) {
    const removeIds = new Set();
    for (const { remove } of dupGroups) {
      for (const r of remove) removeIds.add(r.id);
    }
    contactsForDomain = contacts.filter((c) => !removeIds.has(c.id));
  }

  const companyMap = await fetchCompaniesMap(supabase);

  /** @type {Map<string, any[]>} */
  const byDomain = new Map();
  for (const c of contactsForDomain) {
    const em = String(c.email || "").replace(/^[\s\t]+|[\s\t]+$/g, "");
    const domain = extractDomain(em);
    if (!domain) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push(c);
  }

  const domainKeys = [...byDomain.keys()].sort();

  /** @type {Array<{ domain: string; targetId: string; targetName: string; created: boolean; fixes: any[]; skipped: boolean; reason?: string }>} */
  const plan = [];

  for (const domain of domainKeys) {
    const list = byDomain.get(domain) || [];
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
      plan.push({
        domain,
        targetId: "",
        targetName: "",
        created: false,
        fixes: [],
        skipped: true,
        reason: "公共邮箱域名，跳过合并",
      });
      continue;
    }

    /** @type {Map<string, { id: string; count: number; name: string }>} */
    const companyCounts = new Map();
    for (const c of list) {
      const cid = c.company_id;
      if (!cid) continue;
      if (!companyCounts.has(cid)) {
        companyCounts.set(cid, {
          id: cid,
          count: 0,
          name: companyMap.get(cid) || "—",
        });
      }
      companyCounts.get(cid).count++;
    }

    const entries = [...companyCounts.values()];
    if (entries.length <= 1) {
      domainsOk++;
      plan.push({
        domain,
        targetId: entries[0]?.id || "",
        targetName: entries[0]?.name || "",
        created: false,
        fixes: [],
        skipped: false,
      });
      continue;
    }

    const maxCount = Math.max(...entries.map((e) => e.count));
    const top = entries.filter((e) => e.count === maxCount);

    let targetId;
    let targetName;
    let created = false;

    if (top.length === 1) {
      targetId = top[0].id;
      targetName = top[0].name;
    } else {
      let best = top[0];
      let bestScore = domainCompanyMatchScore(domain, best.name);
      for (const e of top.slice(1)) {
        const s = domainCompanyMatchScore(domain, e.name);
        if (s > bestScore) {
          bestScore = s;
          best = e;
        } else if (s === bestScore && String(e.id).localeCompare(String(best.id)) < 0) {
          best = e;
        }
      }

      if (bestScore > 0) {
        targetId = best.id;
        targetName = best.name;
      } else {
        const pretty = prettyCompanyNameFromDomain(domain);
        const existing = await findCompanyByPrettyName(supabase, domain, pretty);
        if (existing) {
          targetId = existing.id;
          targetName = existing.name;
        } else if (EXECUTE) {
          const { data: inserted, error } = await supabase
            .from("companies")
            .insert({ name: pretty, type: "developer" })
            .select("id, name")
            .single();
          if (error) throw error;
          targetId = inserted.id;
          targetName = inserted.name;
          companyMap.set(targetId, targetName);
          created = true;
          newCompanies++;
        } else {
          targetId = "__dry_run_new__";
          targetName = `${pretty}（dry-run 未插入）`;
          created = true;
          newCompanies++;
        }
      }
    }

    /** @type {any[]} */
    const fixes = [];
    for (const c of list) {
      if (c.company_id === targetId) continue;
      fixes.push({
        id: c.id,
        name: c.name,
        email: c.email,
        fromId: c.company_id,
        fromName: companyMap.get(c.company_id) || "—",
        toId: targetId,
        toName: targetName,
      });
    }

    if (fixes.length > 0) {
      domainsNeedFix++;
      domainFixCount += fixes.length;
    } else {
      domainsOk++;
    }

    plan.push({
      domain,
      targetId,
      targetName,
      created,
      fixes,
      skipped: false,
    });
  }

  /** ---------- 输出 ---------- */
  console.log("========== 按域名分组 ==========\n");
  for (const p of plan) {
    if (p.skipped) {
      const list = byDomain.get(p.domain) || [];
      console.log(`[${p.domain}] ${list.length} 个联系人`);
      console.log(`  跳过：${p.reason}\n`);
      continue;
    }

    const list = byDomain.get(p.domain) || [];
    /** @type {Map<string, number>} */
    const dist = new Map();
    for (const c of list) {
      const n = companyMap.get(c.company_id) || "—";
      dist.set(n, (dist.get(n) || 0) + 1);
    }
    const distStr = [...dist.entries()]
      .map(([n, k]) => `${n}(${k})`)
      .join(", ");

    console.log(`[${p.domain}] ${list.length} 个联系人`);
    console.log(`  当前分布：${distStr}`);

    if (p.fixes.length === 0) {
      console.log(`  OK - 全部一致，跳过\n`);
      continue;
    }

    const createNote = p.created ? `（${DRY_RUN ? "dry-run 将新建" : "已新建"}：${p.targetName}）` : "";
    console.log(`  → 全部归到 ${p.targetName}${createNote}`);

    for (const f of p.fixes) {
      console.log(
        `  FIX: ${f.name} (${f.email}) ${f.fromName} → ${p.targetName}`
      );
    }
    console.log("");
  }

  /** ---------- 执行 UPDATE ---------- */
  if (EXECUTE) {
    for (const p of plan) {
      if (p.skipped || p.fixes.length === 0) continue;
      for (const f of p.fixes) {
        const tid = f.toId;
        if (!isUuid(tid)) continue;
        const { error } = await supabase.from("contacts").update({ company_id: tid }).eq("id", f.id);
        if (error) throw error;
      }
    }
    console.log("已应用 company_id 更新。\n");
  }

  const totalDomains = domainKeys.filter((d) => !PUBLIC_EMAIL_DOMAINS.has(d)).length;
  const skippedPublic = domainKeys.filter((d) => PUBLIC_EMAIL_DOMAINS.has(d)).length;

  console.log("========== 汇总 ==========");
  console.log(`域名总数（非公共邮箱）：${totalDomains}`);
  console.log(`跳过公共邮箱域名：${skippedPublic} 个`);
  console.log(`一致（无需修复）：${domainsOk} 个域名`);
  console.log(`需要修复：${domainsNeedFix} 个域名，涉及 ${domainFixCount} 个联系人`);
  console.log(`需要新建公司：${newCompanies} 个`);
  console.log(`重复邮箱：${dupGroups.length} 组（${duplicateDeletes} 条将删除）`);
  if (!EXECUTE) {
    console.log(`邮箱 TRIM：${trimCount} 条（仅 --execute 时写入）`);
  }
  console.log("");
  if (DRY_RUN) {
    console.log("以上为预览。确认后运行：node scripts/fix-contact-companies.js --execute");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
