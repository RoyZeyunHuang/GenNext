/**
 * 从 Supabase 导出楼盘完整信息到 CSV
 *
 *   node scripts/export-properties.js
 *
 * 输出：项目根目录 properties_export.csv
 * 环境：.env.local → NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const OUT_PATH = path.resolve(process.cwd(), "properties_export.csv");

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
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

function escapeCsv(value) {
  if (value == null || value === "") return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function hasText(s) {
  return s != null && String(s).trim() !== "";
}

function isYes(b) {
  return b ? "Yes" : "No";
}

/** @param {string[]} parts */
function joinSemicolon(parts) {
  return parts.filter((p) => hasText(p)).join("; ");
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("请在 .env.local 配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: properties, error: pe } = await supabase
    .from("properties")
    .select("id, name, address, area, build_year, price_range, units")
    .order("name", { ascending: true });

  if (pe) {
    console.error(pe);
    process.exit(1);
  }

  const props = properties ?? [];
  const propertyIds = props.map((p) => p.id);

  let pcs = [];
  if (propertyIds.length) {
    const { data, error: pce } = await supabase
      .from("property_companies")
      .select("property_id, company_id, role")
      .in("property_id", propertyIds);

    if (pce) {
      console.error(pce);
      process.exit(1);
    }
    pcs = data ?? [];
  }

  const devLinks = pcs.filter((r) => r.role === "developer");
  const companyIds = [...new Set(devLinks.map((r) => r.company_id))];

  let companies = [];
  if (companyIds.length) {
    const { data, error: coe } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", companyIds);

    if (coe) {
      console.error(coe);
      process.exit(1);
    }
    companies = data ?? [];
  }

  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

  let contacts = [];
  if (companyIds.length) {
    const { data, error: cte } = await supabase
      .from("contacts")
      .select("id, company_id, name, title, email, is_primary")
      .in("company_id", companyIds);

    if (cte) {
      console.error(cte);
      process.exit(1);
    }
    contacts = data ?? [];
  }

  const contactsByCompany = new Map();
  for (const c of contacts) {
    if (!contactsByCompany.has(c.company_id)) contactsByCompany.set(c.company_id, []);
    contactsByCompany.get(c.company_id).push(c);
  }

  /** property_id -> Set<company_id> */
  const devCompaniesByProperty = new Map();
  for (const link of devLinks) {
    if (!devCompaniesByProperty.has(link.property_id)) {
      devCompaniesByProperty.set(link.property_id, new Set());
    }
    devCompaniesByProperty.get(link.property_id).add(link.company_id);
  }

  let outreachRows = [];
  if (propertyIds.length) {
    const { data: orows, error: oe } = await supabase
      .from("outreach")
      .select("property_id, stage, status")
      .in("property_id", propertyIds);

    if (oe) {
      console.error(oe);
      process.exit(1);
    }
    outreachRows = orows ?? [];
  }

  /** property_id -> stage strings */
  const outreachByProperty = new Map();
  for (const o of outreachRows) {
    const stage = o.stage != null && String(o.stage).trim() !== "" ? String(o.stage).trim() : null;
    const legacy = o.status != null && String(o.status).trim() !== "" ? String(o.status).trim() : null;
    const label = stage || legacy || "";
    if (!outreachByProperty.has(o.property_id)) outreachByProperty.set(o.property_id, []);
    if (label) outreachByProperty.get(o.property_id).push(label);
  }

  const headers = [
    "Property",
    "Address",
    "Area",
    "Build Year",
    "Price Range",
    "Units",
    "Developer",
    "Marketing/Leasing Contact",
    "Title",
    "Email",
    "Executive Contact",
    "Executive Title",
    "Executive Email",
    "Outreach Stage",
    "Has Address",
    "Has Build Year",
    "Has Price Range",
    "Has Contact Email",
  ];

  let nAddr = 0;
  let nNoAddr = 0;
  let nBy = 0;
  let nNoBy = 0;
  let nPr = 0;
  let nNoPr = 0;
  let nEm = 0;
  let nNoEm = 0;

  const lines = [headers.map(escapeCsv).join(",")];

  for (const p of props) {
    const cids = devCompaniesByProperty.get(p.id);
    const companyIdList = cids ? [...cids] : [];

    const developerNames = companyIdList
      .map((cid) => companyNameById.get(cid))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "en"));
    const developerCol = joinSemicolon(developerNames);

    const mkt = [];
    const exec = [];
    const allEmails = [];

    for (const cid of companyIdList) {
      const list = contactsByCompany.get(cid) ?? [];
      for (const c of list) {
        const em = (c.email || "").trim();
        if (hasText(em)) allEmails.push(em);
        if (c.is_primary === true) {
          mkt.push(c);
        } else {
          exec.push(c);
        }
      }
    }

    const mktSort = (a, b) => (a.name || "").localeCompare(b.name || "", "en");
    mkt.sort(mktSort);
    exec.sort(mktSort);

    const mNames = joinSemicolon(mkt.map((c) => c.name || ""));
    const mTitles = joinSemicolon(mkt.map((c) => (c.title || "").trim()));
    const mEmails = joinSemicolon(mkt.map((c) => (c.email || "").trim()));

    const eNames = joinSemicolon(exec.map((c) => c.name || ""));
    const eTitles = joinSemicolon(exec.map((c) => (c.title || "").trim()));
    const eEmails = joinSemicolon(exec.map((c) => (c.email || "").trim()));

    const stages = outreachByProperty.get(p.id) ?? [];
    const stageCol = joinSemicolon([...new Set(stages)]);

    const hasAddr = hasText(p.address);
    const hasBy = p.build_year != null && String(p.build_year).trim() !== "";
    const hasPr = hasText(p.price_range);
    const hasEm = allEmails.length > 0;

    if (hasAddr) nAddr++;
    else nNoAddr++;
    if (hasBy) nBy++;
    else nNoBy++;
    if (hasPr) nPr++;
    else nNoPr++;
    if (hasEm) nEm++;
    else nNoEm++;

    const row = [
      p.name,
      p.address ?? "",
      p.area ?? "",
      p.build_year != null ? String(p.build_year) : "",
      p.price_range ?? "",
      p.units != null ? String(p.units) : "",
      developerCol,
      mNames,
      mTitles,
      mEmails,
      eNames,
      eTitles,
      eEmails,
      stageCol,
      isYes(hasAddr),
      isYes(hasBy),
      isYes(hasPr),
      isYes(hasEm),
    ];

    lines.push(row.map(escapeCsv).join(","));
  }

  fs.writeFileSync(OUT_PATH, lines.join("\n") + "\n", "utf8");

  const n = props.length;
  console.log(`导出完成：共 ${n} 个楼盘`);
  console.log(`  有地址：${nAddr} 个`);
  console.log(`  无地址：${nNoAddr} 个`);
  console.log(`  有 Build Year：${nBy} 个`);
  console.log(`  无 Build Year：${nNoBy} 个`);
  console.log(`  有 Price Range：${nPr} 个`);
  console.log(`  无 Price Range：${nNoPr} 个`);
  console.log(`  有联系人邮箱：${nEm} 个`);
  console.log(`  无联系人邮箱：${nNoEm} 个`);
  console.log(`\n已写入 ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
