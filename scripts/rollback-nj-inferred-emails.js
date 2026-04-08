/**
 * 精确撤回 import-nj-inferred-emails.js 第二批导入的数据
 * 只删除该批次新建的记录，已存在的不动
 *
 * 预览：node scripts/rollback-nj-inferred-emails.js --dry-run
 * 执行：node scripts/rollback-nj-inferred-emails.js
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const DRY_RUN = process.argv.includes("--dry-run");
const XLSX_PATH = path.resolve(process.cwd(), "research/nj_developer_inferred_emails.xlsx");

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

function escapeIlike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const PROPERTY_RENAMES = new Map([
  ["Russo Development|||West", "Vermella West"],
  ["Russo Development|||East (Kearny)", "Vermella East (Kearny)"],
]);

async function main() {
  loadEnvLocal();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const wb = XLSX.readFile(XLSX_PATH);
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  // 还原导入逻辑，识别哪些是这批新建的
  let lastProps = "";
  const allDevs = new Set();
  const allProps = new Set();
  const allEmails = new Set();

  for (const raw of rawRows) {
    const dev = String(raw["Developer Company"] || "").trim();
    let props = String(raw["Properties"] || "").trim();
    if (/same\s+as\s+above/i.test(props)) props = lastProps;
    else lastProps = props;
    const email = String(raw["Inferred Email"] || "").trim();

    allDevs.add(dev);
    const names = props.split(",").map((s) => s.trim()).filter(Boolean).map((p) => {
      const renamed = PROPERTY_RENAMES.get(`${dev}|||${p}`);
      return renamed || p;
    });
    names.forEach((n) => allProps.add(n));
    if (email && email.includes("@")) allEmails.add(email.toLowerCase());
  }

  // 这些公司在导入前就存在，不能删
  const preExistingCompanies = new Set([
    "Hartz Mountain Industries", "Veris Residential", "AvalonBay Communities",
    "Greystar", "Sanz Management", "Kushner Real Estate Group",
  ]);

  // 这些楼盘在导入前就存在，不能删
  const preExistingProperties = new Set([
    "The Estuary", "Harbor 1500", "Hamilton Cove", "Hoboken Point",
    "The Reserve at Estuary", "RiverHouse 11", "RiverHouse 9",
    "RiverTrace", "The Capstone",
  ]);

  // 这些联系人在导入前就存在，不能删
  const preExistingEmails = new Set([
    "stephen.benoit@hartzmountain.com", "vrezabala@verisresidential.com",
    "njones@verisresidential.com", "sgrosso@verisresidential.com",
    "jminchilli@verisresidential.com",
  ]);

  const newDevs = [...allDevs].filter((d) => !preExistingCompanies.has(d));
  const newProps = [...allProps].filter((p) => !preExistingProperties.has(p));
  const newEmails = [...allEmails].filter((e) => !preExistingEmails.has(e));

  console.log(`将撤回: ${newDevs.length} 家公司, ${newProps.length} 个楼盘, ${newEmails.length} 个联系人\n`);

  // === 1. 删除联系人 ===
  let deletedContacts = 0;
  for (const email of newEmails) {
    const { data } = await supabase.from("contacts").select("id, name, email").ilike("email", escapeIlike(email)).limit(1);
    if (!data?.length) continue;
    const c = data[0];
    if (DRY_RUN) {
      console.log(`[删除联系人] ${c.name} | ${c.email} | id: ${c.id}`);
    } else {
      const { error } = await supabase.from("contacts").delete().eq("id", c.id);
      if (error) throw error;
    }
    deletedContacts++;
  }

  // === 2. 查找新建楼盘的 ID，删除关联 ===
  let deletedLinks = 0;
  const propIds = new Map();
  for (const pName of newProps) {
    const { data } = await supabase.from("properties").select("id, name").ilike("name", escapeIlike(pName)).limit(1);
    if (data?.length) propIds.set(pName, data[0].id);
  }

  // 也要删除已存在楼盘上由这批新建公司产生的关联
  const newCompanyIds = new Map();
  for (const dev of newDevs) {
    const { data } = await supabase.from("companies").select("id, name").ilike("name", escapeIlike(dev)).limit(1);
    if (data?.length) newCompanyIds.set(dev, data[0].id);
  }

  // 删除新建楼盘上的所有关联
  for (const [pName, pid] of propIds) {
    const { data: links } = await supabase.from("property_companies").select("id, company_id").eq("property_id", pid);
    for (const link of links || []) {
      if (DRY_RUN) {
        console.log(`[删除关联] 楼盘 ${pName} (${pid}) ↔ company ${link.company_id}`);
      } else {
        await supabase.from("property_companies").delete().eq("id", link.id);
      }
      deletedLinks++;
    }
  }

  // 删除已存在楼盘上由新建公司产生的关联
  for (const preExProp of preExistingProperties) {
    const { data } = await supabase.from("properties").select("id").ilike("name", escapeIlike(preExProp)).limit(1);
    if (!data?.length) continue;
    const pid = data[0].id;
    for (const [dev, cid] of newCompanyIds) {
      const { data: links } = await supabase.from("property_companies").select("id")
        .eq("property_id", pid).eq("company_id", cid);
      for (const link of links || []) {
        if (DRY_RUN) console.log(`[删除关联] 已有楼盘 ${preExProp} ↔ 新公司 ${dev}`);
        else await supabase.from("property_companies").delete().eq("id", link.id);
        deletedLinks++;
      }
    }
  }

  // === 3. 删除楼盘 ===
  let deletedProps = 0;
  for (const [pName, pid] of propIds) {
    if (DRY_RUN) {
      console.log(`[删除楼盘] ${pName} | id: ${pid}`);
    } else {
      const { error } = await supabase.from("properties").delete().eq("id", pid);
      if (error) throw error;
    }
    deletedProps++;
  }

  // === 4. 删除公司 ===
  let deletedCompanies = 0;
  for (const [dev, cid] of newCompanyIds) {
    if (DRY_RUN) {
      console.log(`[删除公司] ${dev} | id: ${cid}`);
    } else {
      const { error } = await supabase.from("companies").delete().eq("id", cid);
      if (error) throw error;
    }
    deletedCompanies++;
  }

  console.log("\n=== 撤回汇总 ===");
  const p = DRY_RUN ? "将" : "已";
  console.log(`${p}删除联系人 ${deletedContacts} 个`);
  console.log(`${p}删除关联 ${deletedLinks} 条`);
  console.log(`${p}删除楼盘 ${deletedProps} 个`);
  console.log(`${p}删除公司 ${deletedCompanies} 个`);
  console.log(`保留已存在公司: ${[...preExistingCompanies].join(", ")}`);
  console.log(`保留已存在楼盘: ${[...preExistingProperties].join(", ")}`);
  console.log(`保留已存在联系人: ${[...preExistingEmails].join(", ")}`);

  if (DRY_RUN) console.log("\n确认后执行：node scripts/rollback-nj-inferred-emails.js");
}

main().catch((e) => { console.error(e); process.exit(1); });
