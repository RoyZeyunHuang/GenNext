/**
 * 从 research/nj_developer_inferred_emails_v3.xlsx 导入 CRM
 * Properties 逗号分隔，Address 分号分隔（按位对应楼盘），"Same as above"/"See above" 引用上一行
 *
 * 预览：node scripts/import-nj-inferred-emails.js --dry-run
 * 执行：node scripts/import-nj-inferred-emails.js
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const DRY_RUN = process.argv.includes("--dry-run");
const XLSX_PATH = path.resolve(process.cwd(), "research/nj_developer_inferred_emails_v3.xlsx");

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

function escapeIlike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isValidEmail(email) {
  const e = String(email || "").trim();
  return e.length > 3 && e.includes("@") && !e.includes(" ");
}

// Russo "Vermella Crossing, West, East" → 三个独立楼盘
const PROPERTY_RENAMES = new Map([
  ["Russo Development|||West", "Vermella West"],
  ["Russo Development|||East", "Vermella East"],
]);

function parsePropertyNames(raw) {
  return String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function parseAddresses(raw) {
  return String(raw || "").split(";").map((s) => s.trim()).filter(Boolean);
}

async function findCompanyByNameIlike(supabase, name) {
  const { data, error } = await supabase
    .from("companies").select("id, name").ilike("name", escapeIlike(name.trim())).limit(1);
  if (error) throw error;
  return data?.length ? data[0] : null;
}

async function findPropertyByNameIlike(supabase, name) {
  const { data, error } = await supabase
    .from("properties").select("id, name, address").ilike("name", escapeIlike(name.trim())).limit(1);
  if (error) throw error;
  return data?.length ? data[0] : null;
}

async function findPropertyCompany(supabase, propertyId, companyId, role) {
  const { data, error } = await supabase
    .from("property_companies").select("id")
    .eq("property_id", propertyId).eq("company_id", companyId).eq("role", role).limit(1);
  if (error) throw error;
  return data?.length ? data[0] : null;
}

async function fetchExistingContactsByEmails(supabase, emailList) {
  const map = new Map();
  for (const em of emailList) {
    const { data, error } = await supabase
      .from("contacts").select("id, name, title, email")
      .ilike("email", escapeIlike(em.trim())).limit(1);
    if (error) throw error;
    if (data?.length) map.set(em.trim().toLowerCase(), data[0]);
  }
  return map;
}

async function main() {
  loadEnvLocal();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const wb = XLSX.readFile(XLSX_PATH);
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`读取 ${rawRows.length} 行数据\n`);

  // 展开 "Same as above" / "See above"
  let lastProps = "", lastAddr = "";
  const rows = [];
  // 第一遍：按 developer 聚合楼盘名→地址映射
  const propAddrMap = new Map(); // propertyName → address

  for (const raw of rawRows) {
    const dev = String(raw["Developer Company"] || "").trim();
    let props = String(raw["Properties"] || "").trim();
    let addr = String(raw["Address"] || "").trim();
    if (/same\s+as\s+above/i.test(props)) props = lastProps;
    else lastProps = props;
    if (/see\s+above/i.test(addr)) addr = lastAddr;
    else lastAddr = addr;

    const email = String(raw["Inferred Email"] || "").trim();
    const name = String(raw["Name"] || "").trim();
    const title = String(raw["Title"] || "").trim();
    const confidence = String(raw["Confidence"] || "").trim();

    const propNames = parsePropertyNames(props).map((p) => {
      const renamed = PROPERTY_RENAMES.get(`${dev}|||${p}`);
      return renamed || p;
    });
    const addresses = parseAddresses(addr);

    // 按位对应楼盘和地址
    for (let i = 0; i < propNames.length; i++) {
      if (addresses[i] && !propAddrMap.has(propNames[i])) {
        propAddrMap.set(propNames[i], addresses[i]);
      }
    }

    if (!dev || !isValidEmail(email)) continue;
    rows.push({ developer: dev, propertyNames: propNames, contactName: name, title: title || null, email, confidence });
  }

  // 手动补充缺失地址
  const MANUAL_ADDR = {
    "Osprey Cove": "45 Meadowlands Pkwy, Secaucus",
    "The Harper at Harmon Meadow": "100 Park Plaza Dr, Secaucus",
    "Vermella West": "135 Passaic Ave, Kearny",
    "Vermella East": "60 Passaic Ave, Kearny",
  };
  for (const [name, addr] of Object.entries(MANUAL_ADDR)) {
    if (!propAddrMap.has(name)) propAddrMap.set(name, addr);
  }

  console.log(`有效行: ${rows.length}（有开发商 + 有效 email）`);
  console.log(`楼盘-地址映射: ${propAddrMap.size} 个\n`);

  const uniqueDevelopers = [...new Set(rows.map((r) => r.developer))];
  const allPropNames = new Set();
  for (const r of rows) r.propertyNames.forEach((p) => allPropNames.add(p));
  const uniqueProperties = [...allPropNames];

  let newCompanies = 0, newProperties = 0, updatedProperties = 0, newLinks = 0;
  let newContacts = 0, updatedContacts = 0, skippedContacts = 0;

  // === 公司 ===
  const devToId = new Map();
  for (const dev of uniqueDevelopers) {
    const existing = await findCompanyByNameIlike(supabase, dev);
    if (existing) {
      devToId.set(dev, existing.id);
      if (DRY_RUN) console.log(`[已存在公司] ${existing.name} → ${existing.id}`);
      continue;
    }
    if (DRY_RUN) {
      devToId.set(dev, crypto.randomUUID());
      newCompanies++;
      console.log(`[新建公司] ${dev}`);
    } else {
      const { data, error } = await supabase.from("companies").insert({ name: dev, type: "developer" }).select("id").single();
      if (error) throw error;
      devToId.set(dev, data.id);
      newCompanies++;
    }
  }

  // === 楼盘 ===
  const propToId = new Map();
  for (const pName of uniqueProperties) {
    const addr = propAddrMap.get(pName) || null;
    const existing = await findPropertyByNameIlike(supabase, pName);
    if (existing) {
      propToId.set(pName, existing.id);
      // 补地址（如果库里没有）
      if (addr && (!existing.address || !existing.address.trim())) {
        if (DRY_RUN) {
          updatedProperties++;
          console.log(`[更新楼盘地址] ${pName} → ${addr}`);
        } else {
          await supabase.from("properties").update({ address: addr }).eq("id", existing.id);
          updatedProperties++;
        }
      } else if (DRY_RUN) {
        console.log(`[已存在楼盘] ${existing.name} → ${existing.id}`);
      }
      continue;
    }
    if (DRY_RUN) {
      propToId.set(pName, crypto.randomUUID());
      newProperties++;
      console.log(`[新建楼盘] ${pName} | 地址: ${addr || "—"}`);
    } else {
      const { data, error } = await supabase.from("properties")
        .insert({ name: pName, address: addr }).select("id").single();
      if (error) throw error;
      propToId.set(pName, data.id);
      newProperties++;
    }
  }

  // === 关联 ===
  const linkSeen = new Set();
  for (const r of rows) {
    const companyId = devToId.get(r.developer);
    if (!companyId) continue;
    for (const pName of r.propertyNames) {
      const propertyId = propToId.get(pName);
      if (!propertyId) continue;
      const key = `${propertyId}|${companyId}`;
      if (linkSeen.has(key)) continue;
      if (!DRY_RUN) {
        const exists = await findPropertyCompany(supabase, propertyId, companyId, "developer");
        if (exists) { linkSeen.add(key); continue; }
      }
      linkSeen.add(key);
      if (DRY_RUN) {
        newLinks++;
        console.log(`[新建关联] ${pName} ↔ ${r.developer}`);
      } else {
        const { error } = await supabase.from("property_companies").insert({
          property_id: propertyId, company_id: companyId, role: "developer",
        });
        if (error) throw error;
        newLinks++;
      }
    }
  }

  // === 联系人 ===
  const emails = new Set(rows.map((r) => r.email.trim().toLowerCase()));
  const contactSnapshot = await fetchExistingContactsByEmails(supabase, [...emails]);
  const handled = new Set();

  for (const r of rows) {
    const companyId = devToId.get(r.developer);
    if (!companyId) continue;
    const key = r.email.trim().toLowerCase();
    if (handled.has(key)) { skippedContacts++; continue; }

    const name = r.contactName || r.email.split("@")[0];
    const existing = contactSnapshot.get(key);

    if (!existing) {
      if (DRY_RUN) {
        newContacts++;
        console.log(`[新建联系人] ${name} | ${r.email} | ${r.title || "—"} | ${r.confidence} | ${r.developer}`);
      } else {
        const { data, error } = await supabase.from("contacts")
          .insert({ company_id: companyId, name, title: r.title, email: r.email.trim(), is_primary: true })
          .select("id, name, title, email").single();
        if (error) throw error;
        newContacts++;
        if (data) contactSnapshot.set(key, data);
      }
      handled.add(key);
      continue;
    }

    if (!existing.name || !String(existing.name).trim()) {
      if (DRY_RUN) {
        updatedContacts++;
        console.log(`[更新联系人] ${key} → ${name}`);
      } else {
        await supabase.from("contacts").update({ name, title: r.title }).eq("id", existing.id);
        updatedContacts++;
      }
      handled.add(key);
      continue;
    }

    skippedContacts++;
    if (DRY_RUN) console.log(`[跳过联系人] 已存在 ${key} (${existing.name})`);
    handled.add(key);
  }

  console.log("\n=== 汇总 ===");
  const p = DRY_RUN ? "将" : "已";
  console.log(`${p}新建公司 ${newCompanies} 个`);
  console.log(`${p}新建楼盘 ${newProperties} 个`);
  console.log(`${p}更新楼盘地址 ${updatedProperties} 个`);
  console.log(`${p}新建关联 ${newLinks} 条`);
  console.log(`${p}新建联系人 ${newContacts} 个`);
  console.log(`${p}更新联系人 ${updatedContacts} 个`);
  console.log(`跳过联系人 ${skippedContacts} 个`);

  if (DRY_RUN) console.log("\n确认后执行：node scripts/import-nj-inferred-emails.js");
}

main().catch((e) => { console.error(e); process.exit(1); });
