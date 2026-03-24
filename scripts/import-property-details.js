/**
 * 一次性：从 CSV 更新现有楼盘的 address、price_range、units
 *
 *   node scripts/import-property-details.js --dry-run   # 预览，不写库
 *   node scripts/import-property-details.js --execute  # 执行更新
 *
 * 输入：项目根目录 properties_export_updated 1.csv
 * 列：Property, Address, Price Range, Units
 *
 * 匹配：properties.name ILIKE（与 import 脚本一致，去首尾空格）
 * 规则：仅当 CSV 某列非空时才更新该字段；空列不覆盖数据库
 *
 * 环境：.env.local → NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * 部署前请在 Supabase SQL 中执行（或已通过迁移）：
 *   supabase/migrations/023_properties_detail_columns.sql
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const EXECUTE = process.argv.includes("--execute");

if (!DRY_RUN && !EXECUTE) {
  console.error("用法: node scripts/import-property-details.js --dry-run | --execute");
  process.exit(1);
}
if (DRY_RUN && EXECUTE) {
  console.error("不能同时使用 --dry-run 与 --execute");
  process.exit(1);
}

const CSV_PATH = path.resolve(process.cwd(), "properties_export_updated 1.csv");

const COL = {
  PROPERTY: "Property",
  ADDRESS: "Address",
  PRICE_RANGE: "Price Range",
  UNITS: "Units",
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

/**
 * @returns {{ value: number | null, invalid: boolean }}
 */
function parseUnits(s) {
  const t = String(s ?? "").trim();
  if (!t) return { value: null, invalid: false };
  const n = parseInt(t.replace(/,/g, ""), 10);
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

async function findPropertyByNameIlike(supabase, name) {
  const pattern = escapeIlike(name.trim());
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, address, price_range, units")
    .ilike("name", pattern)
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0] : null;
}

function formatUpdateLine(propName, patch, emptyLabels) {
  const parts = [];
  if (patch.address != null) parts.push(`address: ${JSON.stringify(patch.address)}`);
  if (patch.price_range != null) parts.push(`price_range: ${JSON.stringify(patch.price_range)}`);
  if (patch.units != null) parts.push(`units: ${patch.units}`);

  let line = `UPDATE [Property] "${propName}" → ${parts.join(", ")}`;
  if (emptyLabels.length) {
    line += ` (${emptyLabels.join("/")} 为空，跳过)`;
  }
  return line;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("请在 .env.local 配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error("未找到文件:", CSV_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const { headers, rows } = parseCsv(raw);

  const need = [COL.PROPERTY, COL.ADDRESS, COL.PRICE_RANGE, COL.UNITS];
  for (const h of need) {
    if (!headers.includes(h)) {
      console.error(`CSV 缺少列: "${h}"，当前表头: ${headers.join(", ")}`);
      process.exit(1);
    }
  }

  if (rows.length === 0) {
    console.error("CSV 无数据行");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  let nUpdate = 0;
  let nSkip = 0;
  let nNoChange = 0;

  for (const row of rows) {
    const propName = (row[COL.PROPERTY] || "").trim();
    if (!propName) {
      console.warn("SKIP [Property] (空行/无 Property 名)");
      nSkip++;
      continue;
    }

    const csvAddr = (row[COL.ADDRESS] || "").trim();
    const csvPrice = (row[COL.PRICE_RANGE] || "").trim();
    const rawUnits = (row[COL.UNITS] || "").trim();
    const unitsParsed = parseUnits(row[COL.UNITS]);
    if (unitsParsed.invalid) {
      console.warn(`WARN [Property] "${propName}" → Units 非数字，已忽略该字段`);
    }

    const csvUnits = unitsParsed.invalid ? null : unitsParsed.value;

    /** 三列字面均为空（与 units 是否可解析无关） */
    const allEmpty = !csvAddr && !csvPrice && rawUnits === "";

    const dbRow = await findPropertyByNameIlike(supabase, propName);
    if (!dbRow) {
      console.log(`SKIP [Property] "${propName}" → 数据库未找到`);
      nSkip++;
      continue;
    }

    if (allEmpty) {
      console.log(`NO CHANGE [Property] "${dbRow.name}" → CSV 三个字段都为空`);
      nNoChange++;
      continue;
    }

    const patch = {};
    if (csvAddr) patch.address = csvAddr;
    if (csvPrice) patch.price_range = csvPrice;
    if (csvUnits != null) patch.units = csvUnits;

    if (Object.keys(patch).length === 0) {
      console.log(`NO CHANGE [Property] "${dbRow.name}" → 无可更新字段（Units 无效且其余为空）`);
      nNoChange++;
      continue;
    }

    const emptyLabels = [];
    if (!csvAddr) emptyLabels.push("address");
    if (!csvPrice) emptyLabels.push("price_range");
    if (rawUnits === "") emptyLabels.push("units");

    console.log(formatUpdateLine(dbRow.name, patch, emptyLabels));

    if (EXECUTE) {
      const { error } = await supabase
        .from("properties")
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dbRow.id);
      if (error) {
        console.error(`ERROR [Property] "${dbRow.name}":`, error.message);
        throw error;
      }
    }

    nUpdate++;
  }

  console.log("\n========== 【汇总】 ==========");
  console.log(`更新：${nUpdate} 个楼盘`);
  console.log(`跳过：${nSkip} 个（数据库未找到或无 Property 名）`);
  console.log(`无变化：${nNoChange} 个（CSV 无新数据）`);
  if (DRY_RUN) {
    console.log("\n（以上为 dry-run，未写入数据库。使用 --execute 执行。）");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
