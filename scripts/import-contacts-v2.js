/**
 * 带冲突检测的联系人/楼盘导入（contacts.csv）
 *
 *   node scripts/import-contacts-v2.js --dry-run   # 检测冲突，写入 conflicts.json，不修改数据库
 *   node scripts/import-contacts-v2.js --execute   # 按 conflicts.json 的 action 正式导入
 *
 * 补全（FILL）：数据库字段为空而 CSV 有值时视为补全，不算冲突、不写入 conflicts.json；
 *              --execute 时直接 UPDATE。
 *
 * 环境：.env.local → NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * CSV 列：Developer, Property, Build Year, Marketing/Leasing Contact, Title, Email,
 *         Executive Contact, Executive Title, Executive Email
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const EXECUTE = process.argv.includes("--execute");

if (!DRY_RUN && !EXECUTE) {
  console.error("用法: node scripts/import-contacts-v2.js --dry-run | --execute");
  process.exit(1);
}
if (DRY_RUN && EXECUTE) {
  console.error("不能同时使用 --dry-run 与 --execute");
  process.exit(1);
}

const CSV_PATH = path.resolve(process.cwd(), "contacts.csv");
const CONFLICTS_PATH = path.resolve(process.cwd(), "conflicts.json");

const COL = {
  DEVELOPER: "Developer",
  PROPERTY: "Property",
  BUILD_YEAR: "Build Year",
  MKT_NAME: "Marketing/Leasing Contact",
  MKT_TITLE: "Title",
  MKT_EMAIL: "Email",
  EXEC_NAME: "Executive Contact",
  EXEC_TITLE: "Executive Title",
  EXEC_EMAIL: "Executive Email",
};

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

function escapeIlike(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCsv(content) {
  const text = content.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((ln, idx) => idx === 0 || ln.length > 0);
  if (lines.length === 0 || !lines[0].trim()) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? String(cells[idx]).trim() : "";
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function isValidEmail(email) {
  const e = String(email || "").trim();
  return e.length > 0 && e.includes("@");
}

function normYear(y) {
  if (y == null || y === "") return null;
  const n = parseInt(String(y).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function normStr(s) {
  if (s == null || s === "") return "";
  return String(s).trim().replace(/\s+/g, " ");
}

function yearsEqual(a, b) {
  const na = normYear(a);
  const nb = normYear(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  return na === nb;
}

/** 数据库或 CSV 中的年份视为「空」时可补全 */
function isEmptyYear(y) {
  if (y == null || y === "") return true;
  return normYear(y) === null;
}

async function findCompanyByNameIlike(supabase, name) {
  const pattern = escapeIlike(name.trim());
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .ilike("name", pattern)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function findPropertyByNameIlike(supabase, name) {
  const pattern = escapeIlike(name.trim());
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, build_year")
    .ilike("name", pattern)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function findContactByEmailIlike(supabase, email) {
  const pattern = escapeIlike(email.trim());
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, title, email, company_id")
    .ilike("email", pattern)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function findPropertyCompany(supabase, propertyId, companyId, role) {
  const { data, error } = await supabase
    .from("property_companies")
    .select("id")
    .eq("property_id", propertyId)
    .eq("company_id", companyId)
    .eq("role", role)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

// ---------- dry-run ----------

async function runDryRun(supabase) {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const { rows } = parseCsv(raw);
  if (rows.length === 0) {
    console.error("contacts.csv 无数据行");
    process.exit(1);
  }

  /** @type {{ property: string, developer: string, buildYear: string, marketing: object, executive: object }[]} */
  const dataRows = [];
  for (const row of rows) {
    const property = (row[COL.PROPERTY] || "").trim();
    if (!property) continue;
    dataRows.push({
      property,
      developer: (row[COL.DEVELOPER] || "").trim(),
      buildYear: (row[COL.BUILD_YEAR] || "").trim(),
      marketing: {
        name: (row[COL.MKT_NAME] || "").trim(),
        title: (row[COL.MKT_TITLE] || "").trim(),
        email: (row[COL.MKT_EMAIL] || "").trim(),
        is_primary: true,
      },
      executive: {
        name: (row[COL.EXEC_NAME] || "").trim(),
        title: (row[COL.EXEC_TITLE] || "").trim(),
        email: (row[COL.EXEC_EMAIL] || "").trim(),
        is_primary: false,
      },
    });
  }

  const uniquePropertyNames = [...new Set(dataRows.map((r) => r.property))];
  const uniqueDevelopers = [...new Set(dataRows.map((r) => r.developer).filter(Boolean))];

  /** propertyName -> 代表 build year（首行） */
  const propertyFirstBuildYear = new Map();
  for (const r of dataRows) {
    if (!propertyFirstBuildYear.has(r.property)) propertyFirstBuildYear.set(r.property, r.buildYear);
  }

  let propMatch = 0;
  let propNew = 0;
  let propConflict = 0;
  let propFill = 0;

  const conflictsProperties = [];

  console.log("\n========== 【报告一：楼盘冲突】 ==========\n");

  for (const propName of uniquePropertyNames) {
    const csvYear = propertyFirstBuildYear.get(propName);
    const dbRow = await findPropertyByNameIlike(supabase, propName);

    if (!dbRow) {
      propNew++;
      console.log(`NEW [Property] "${propName}" (build_year: ${normYear(csvYear) ?? "—"})`);
      continue;
    }

    const dbY = dbRow.build_year;
    const csvN = normYear(csvYear);

    if (yearsEqual(dbY, csvYear)) {
      propMatch++;
      console.log(`MATCH [Property] "${propName}" → id: ${dbRow.id}`);
      continue;
    }

    // 数据库无年份、CSV 有年份 → 补全，不算冲突
    if (isEmptyYear(dbY) && csvN != null) {
      propFill++;
      console.log(`FILL [Property] "${propName}" → 补全 build_year: ${csvN}`);
      continue;
    }

    propConflict++;
    console.log(`CONFLICT [Property] "${propName}"`);
    console.log(`    数据库: build_year=${dbY ?? "—"}`);
    console.log(`    CSV:    build_year=${csvN ?? "—"}`);
    console.log(`    → 操作: [覆盖/跳过/手动]（请编辑 conflicts.json）`);
    conflictsProperties.push({
      csv_name: propName,
      csv_build_year: csvYear === "" ? null : String(csvYear),
      db_id: dbRow.id,
      db_build_year: dbY == null ? null : String(dbY),
      action: "ask",
    });
  }

  console.log("\n========== 【报告二：公司冲突】 ==========\n");

  let coMatch = 0;
  let coNew = 0;

  for (const dev of uniqueDevelopers) {
    const dbRow = await findCompanyByNameIlike(supabase, dev);
    if (dbRow) {
      coMatch++;
      console.log(`MATCH [Company] "${dev}" → id: ${dbRow.id}`);
    } else {
      coNew++;
      console.log(`NEW [Company] "${dev}"`);
    }
  }

  console.log("\n========== 【报告三：联系人冲突】 ==========\n");

  let ctMatch = 0;
  let ctNew = 0;
  let ctConflict = 0;
  let ctSkipNoEmail = 0;
  let ctFill = 0;

  const conflictsContacts = [];
  const seenEmails = new Set();

  for (const r of dataRows) {
    if (!r.developer) continue;
    const slots = [
      { ...r.marketing, kind: "marketing", companyLabel: r.developer },
      { ...r.executive, kind: "executive", companyLabel: r.developer },
    ];

    for (const slot of slots) {
      const labelHint = slot.name || slot.kind;
      if (!isValidEmail(slot.email)) {
        ctSkipNoEmail++;
        console.log(
          `SKIP [Contact] No email for "${labelHint}" at "${r.property}" (${r.developer})`
        );
        continue;
      }

      const em = slot.email.trim().toLowerCase();
      if (seenEmails.has(em)) continue;
      seenEmails.add(em);

      const dbC = await findContactByEmailIlike(supabase, slot.email);
      if (!dbC) {
        ctNew++;
        console.log(
          `NEW [Contact] "${normStr(slot.name) || "—"}" (${slot.email.trim()}) → ${r.developer}`
        );
        continue;
      }

      const csvName = normStr(slot.name);
      const csvTitle = normStr(slot.title);
      const dbNameStr = normStr(dbC.name);
      const dbTitleStr = normStr(dbC.title || "");

      const dbNameEmpty = dbNameStr === "";
      const dbTitleEmpty = dbTitleStr === "";

      const nameFill = dbNameEmpty && csvName !== "";
      const titleFill = dbTitleEmpty && csvTitle !== "";

      const nameConflict = !dbNameEmpty && dbNameStr !== csvName;
      const titleConflict = !dbTitleEmpty && dbTitleStr !== csvTitle;

      if (!nameConflict && !titleConflict) {
        if (nameFill || titleFill) {
          ctFill++;
          const em = slot.email.trim();
          if (nameFill) {
            console.log(`FILL [Contact] ${em} → 补全 name: "${csvName}"`);
          }
          if (titleFill) {
            console.log(`FILL [Contact] ${em} → 补全 title: "${csvTitle}"`);
          }
        } else {
          ctMatch++;
          console.log(`MATCH [Contact] "${slot.email.trim()}"`);
        }
        continue;
      }

      ctConflict++;
      console.log(`CONFLICT [Contact] "${slot.email.trim()}"`);
      console.log(
        `    数据库: name="${dbC.name}", title="${dbC.title ?? "—"}"`
      );
      console.log(
        `    CSV:    name="${csvName}", title="${csvTitle}"`
      );
      console.log(`    → 操作: [覆盖/跳过/手动]（请编辑 conflicts.json）`);
      conflictsContacts.push({
        email: slot.email.trim().toLowerCase(),
        csv_name: csvName,
        csv_title: csvTitle,
        db_name: dbC.name,
        db_title: dbC.title || "",
        db_id: dbC.id,
        action: "ask",
      });
    }
  }

  console.log("\n========== 【汇总】 ==========\n");
  console.log(
    `楼盘：${propMatch} 个匹配 / ${propNew} 个新增 / ${propConflict} 个冲突`
  );
  console.log(`公司：${coMatch} 个匹配 / ${coNew} 个新增`);
  console.log(
    `联系人：${ctMatch} 个匹配 / ${ctNew} 个新增 / ${ctConflict} 个冲突 / ${ctSkipNoEmail} 个跳过（无邮箱）`
  );
  console.log(`补全：${propFill} 个楼盘 / ${ctFill} 个联系人`);

  const out = {
    properties: conflictsProperties,
    contacts: conflictsContacts,
  };
  fs.writeFileSync(CONFLICTS_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log(`\n已写入 ${CONFLICTS_PATH}（请把 action: "ask" 改为 "overwrite" 或 "skip" 后执行 --execute）`);
}

// ---------- execute ----------

function loadConflictsFile() {
  if (!fs.existsSync(CONFLICTS_PATH)) {
    return { properties: [], contacts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFLICTS_PATH, "utf8"));
  } catch (e) {
    console.error("读取 conflicts.json 失败:", e.message);
    process.exit(1);
  }
}

function getPropertyConflictAction(conflicts, csvName, dbId) {
  const p = (conflicts.properties || []).find(
    (x) => x.csv_name === csvName && x.db_id === dbId
  );
  return p?.action || null;
}

function getContactConflictAction(conflicts, emailLower) {
  const p = (conflicts.contacts || []).find(
    (x) => (x.email || "").toLowerCase() === emailLower
  );
  return p?.action || null;
}

async function runExecute(supabase) {
  const conflicts = loadConflictsFile();
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const { rows } = parseCsv(raw);

  const dataRows = [];
  for (const row of rows) {
    const property = (row[COL.PROPERTY] || "").trim();
    if (!property) continue;
    dataRows.push({
      property,
      developer: (row[COL.DEVELOPER] || "").trim(),
      buildYear: (row[COL.BUILD_YEAR] || "").trim(),
      marketing: {
        name: (row[COL.MKT_NAME] || "").trim(),
        title: (row[COL.MKT_TITLE] || "").trim(),
        email: (row[COL.MKT_EMAIL] || "").trim(),
        is_primary: true,
      },
      executive: {
        name: (row[COL.EXEC_NAME] || "").trim(),
        title: (row[COL.EXEC_TITLE] || "").trim(),
        email: (row[COL.EXEC_EMAIL] || "").trim(),
        is_primary: false,
      },
    });
  }

  const stats = {
    propInsert: 0,
    propUpdate: 0,
    propSkip: 0,
    propFill: 0,
    coInsert: 0,
    coSkip: 0,
    ctInsert: 0,
    ctUpdate: 0,
    ctSkip: 0,
    ctFill: 0,
    links: 0,
  };

  let askBlocked = false;

  const uniqueDevelopers = [...new Set(dataRows.map((r) => r.developer).filter(Boolean))];
  /** @type {Map<string, string>} */
  const developerToCompanyId = new Map();

  for (const dev of uniqueDevelopers) {
    const existing = await findCompanyByNameIlike(supabase, dev);
    if (existing) {
      developerToCompanyId.set(dev, existing.id);
      stats.coSkip++;
      continue;
    }
    const { data: inserted, error } = await supabase
      .from("companies")
      .insert({ name: dev, type: "developer" })
      .select("id")
      .single();
    if (error) throw error;
    developerToCompanyId.set(dev, inserted.id);
    stats.coInsert++;
  }

  const uniquePropertyNames = [...new Set(dataRows.map((r) => r.property))];
  const propertyFirstBuildYear = new Map();
  for (const r of dataRows) {
    if (!propertyFirstBuildYear.has(r.property)) propertyFirstBuildYear.set(r.property, r.buildYear);
  }

  /** @type {Map<string, string>} */
  const propertyNameToId = new Map();

  for (const propName of uniquePropertyNames) {
    const csvYear = propertyFirstBuildYear.get(propName);
    const csvN = normYear(csvYear);
    const dbRow = await findPropertyByNameIlike(supabase, propName);

    if (!dbRow) {
      const { data: ins, error } = await supabase
        .from("properties")
        .insert({
          name: propName,
          build_year: csvN,
        })
        .select("id")
        .single();
      if (error) throw error;
      propertyNameToId.set(propName, ins.id);
      stats.propInsert++;
      continue;
    }

    propertyNameToId.set(propName, dbRow.id);

    if (yearsEqual(dbRow.build_year, csvYear)) {
      stats.propSkip++;
      continue;
    }

    // 数据库无年份、CSV 有年份 → 直接补全（不依赖 conflicts.json）
    if (isEmptyYear(dbRow.build_year) && csvN != null) {
      const { error } = await supabase
        .from("properties")
        .update({ build_year: csvN, updated_at: new Date().toISOString() })
        .eq("id", dbRow.id);
      if (error) throw error;
      stats.propUpdate++;
      stats.propFill++;
      continue;
    }

    const act = getPropertyConflictAction(conflicts, propName, dbRow.id);
    if (act === "overwrite") {
      const { error } = await supabase
        .from("properties")
        .update({ build_year: csvN, updated_at: new Date().toISOString() })
        .eq("id", dbRow.id);
      if (error) throw error;
      stats.propUpdate++;
    } else if (act === "skip") {
      stats.propSkip++;
    } else if (act === "ask" || act == null) {
      console.warn(
        `【未处理楼盘冲突】"${propName}" (db_id=${dbRow.id})，请编辑 conflicts.json 为 overwrite 或 skip`
      );
      askBlocked = true;
      stats.propSkip++;
    } else {
      stats.propSkip++;
    }
  }

  if (askBlocked) {
    console.warn("\n存在未解决的楼盘冲突（action 仍为 ask 或缺失），已跳过对应更新。");
  }

  for (const r of dataRows) {
    if (!r.developer) continue;
    const companyId = developerToCompanyId.get(r.developer);
    const propertyId = propertyNameToId.get(r.property);
    if (!companyId || !propertyId) continue;

    const exists = await findPropertyCompany(supabase, propertyId, companyId, "developer");
    if (exists) continue;

    const { error } = await supabase.from("property_companies").insert({
      property_id: propertyId,
      company_id: companyId,
      role: "developer",
    });
    if (error) throw error;
    stats.links++;
  }

  const handledEmailKeys = new Set();

  for (const r of dataRows) {
    if (!r.developer) continue;
    const companyId = developerToCompanyId.get(r.developer);
    if (!companyId) continue;

    const slots = [
      { ...r.marketing, kind: "marketing" },
      { ...r.executive, kind: "executive" },
    ];

    for (const slot of slots) {
      if (!isValidEmail(slot.email)) continue;
      const key = slot.email.trim().toLowerCase();
      if (handledEmailKeys.has(key)) {
        stats.ctSkip++;
        continue;
      }

      const csvName = normStr(slot.name);
      const csvTitleRaw = normStr(slot.title);
      const contactName = csvName || slot.email.split("@")[0] || "未命名";
      const titleVal = csvTitleRaw || null;

      const existingRow = await findContactByEmailIlike(supabase, slot.email);

      if (!existingRow) {
        const { error } = await supabase.from("contacts").insert({
          company_id: companyId,
          name: contactName,
          title: titleVal,
          email: slot.email.trim(),
          is_primary: slot.is_primary,
        });
        if (error) throw error;
        stats.ctInsert++;
        handledEmailKeys.add(key);
        continue;
      }

      const dbNameStr = normStr(existingRow.name);
      const dbTitleStr = normStr(existingRow.title || "");
      const dbNameEmpty = dbNameStr === "";
      const dbTitleEmpty = dbTitleStr === "";

      const nameFill = dbNameEmpty && csvName !== "";
      const titleFill = dbTitleEmpty && csvTitleRaw !== "";

      const nameConflict = !dbNameEmpty && dbNameStr !== csvName;
      const titleConflict = !dbTitleEmpty && dbTitleStr !== csvTitleRaw;

      if (!nameConflict && !titleConflict) {
        if (!nameFill && !titleFill) {
          stats.ctSkip++;
          handledEmailKeys.add(key);
          continue;
        }
        const patch = {};
        if (nameFill) patch.name = contactName;
        if (titleFill) patch.title = titleVal;
        const { error } = await supabase.from("contacts").update(patch).eq("id", existingRow.id);
        if (error) throw error;
        stats.ctUpdate++;
        stats.ctFill++;
        handledEmailKeys.add(key);
        continue;
      }

      const act = getContactConflictAction(conflicts, key);
      const conflictUnresolved =
        (nameConflict || titleConflict) && (act == null || act === "ask");

      if (conflictUnresolved) {
        console.warn(
          `【未处理联系人冲突】${key}，请编辑 conflicts.json 为 overwrite 或 skip`
        );
        askBlocked = true;
      }

      let outName = existingRow.name;
      let outTitle = existingRow.title;

      if (!nameConflict) {
        if (nameFill) outName = contactName;
      } else if (act === "overwrite") {
        outName = contactName;
      } else {
        outName = existingRow.name;
      }

      if (!titleConflict) {
        if (titleFill) outTitle = titleVal;
      } else if (act === "overwrite") {
        outTitle = titleVal;
      } else {
        outTitle = existingRow.title;
      }

      const nameChanged = String(outName ?? "") !== String(existingRow.name ?? "");
      const titleChanged =
        (outTitle == null && existingRow.title != null) ||
        (outTitle != null && String(outTitle) !== String(existingRow.title ?? ""));

      if (!nameChanged && !titleChanged) {
        stats.ctSkip++;
        handledEmailKeys.add(key);
        continue;
      }

      const { error } = await supabase
        .from("contacts")
        .update({ name: outName, title: outTitle })
        .eq("id", existingRow.id);
      if (error) throw error;
      stats.ctUpdate++;
      if ((!nameConflict && nameFill) || (!titleConflict && titleFill)) stats.ctFill++;
      handledEmailKeys.add(key);
    }
  }

  if (askBlocked) {
    console.warn("\n存在未解决的联系人冲突，请先编辑 conflicts.json。");
  }

  console.log("\n导入完成：");
  console.log(
    `  楼盘：新增 ${stats.propInsert} / 更新 ${stats.propUpdate} / 跳过 ${stats.propSkip}`
  );
  console.log(`  公司：新增 ${stats.coInsert} / 跳过 ${stats.coSkip}`);
  console.log(
    `  联系人：新增 ${stats.ctInsert} / 更新 ${stats.ctUpdate} / 跳过 ${stats.ctSkip}`
  );
  console.log(`  关联：新增 ${stats.links}`);
  console.log(`  补全：${stats.propFill} 个楼盘 / ${stats.ctFill} 个联系人`);
}

// ---------- main ----------

async function main() {
  loadEnvLocal();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("请在 .env.local 配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error("未找到:", CSV_PATH);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (DRY_RUN) {
    await runDryRun(supabase);
  } else {
    await runExecute(supabase);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
