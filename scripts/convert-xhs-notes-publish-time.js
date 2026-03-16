/**
 * 一次性转换 xhs_notes 表中的发布日期：中文格式 -> 标准格式
 * 与 src/app/api/kpi/upload/route.ts 中的 parseChinesePublishTime 逻辑一致
 *
 * 使用方式：
 *   node scripts/convert-xhs-notes-publish-time.js          # 仅预览，不写库
 *   node scripts/convert-xhs-notes-publish-time.js --apply  # 执行更新
 *
 * 环境变量：从 .env.local 读取 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("未找到 .env.local，请确保在项目根目录运行");
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

/** 与 upload/route.ts 中完全一致的解析逻辑 */
function parseChinesePublishTime(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日(?:(\d{1,2})时)?(?:(\d{1,2})分)?(?:(\d{1,2})秒)?/
  );
  if (m) {
    const [, y, mo, d, h = "0", min = "0", sec = "0"] = m;
    const pad = (n) => String(n).padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(min)}:${pad(sec)}`;
  }
  return s;
}

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from("xhs_notes")
    .select("id, publish_time, title")
    .not("publish_time", "is", null);

  if (error) {
    console.error("查询失败:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("xhs_notes 中暂无 publish_time 非空的记录");
    return;
  }

  const conversions = rows.map((r) => {
    const after = parseChinesePublishTime(r.publish_time);
    const changed = after !== null && String(r.publish_time).trim() !== after;
    return {
      id: r.id,
      title: (r.title || "").slice(0, 24),
      before: r.publish_time,
      after,
      changed,
    };
  });

  console.log("\n=== 发布日期解析预览（与上传接口相同逻辑）===\n");
  console.log("原文 (before) -> 转换后 (after)");
  console.log("-".repeat(80));

  conversions.forEach((c, i) => {
    const beforeStr = (c.before || "").slice(0, 44);
    const afterStr = (c.after || "-").slice(0, 44);
    const tag = c.changed ? " [会更新]" : " [不变]";
    console.log(`${i + 1}. ${beforeStr}`);
    console.log(`   -> ${afterStr}${tag}`);
    if (c.title) console.log(`   标题: ${c.title}`);
    console.log("");
  });

  const toUpdate = conversions.filter((c) => c.changed);
  console.log(`合计: ${rows.length} 条，其中 ${toUpdate.length} 条会从中文格式转为标准格式\n`);

  if (apply && toUpdate.length > 0) {
    console.log("执行更新...");
    let ok = 0;
    for (const c of toUpdate) {
      const { error: err } = await supabase
        .from("xhs_notes")
        .update({ publish_time: c.after })
        .eq("id", c.id);
      if (err) {
        console.error(`  id=${c.id} 更新失败:`, err.message);
      } else {
        ok++;
      }
    }
    console.log(`已更新 ${ok}/${toUpdate.length} 条`);
  } else if (apply) {
    console.log("没有需要更新的记录");
  } else {
    console.log("当前为预览模式，未写入数据库。若要执行更新，请加参数: node scripts/convert-xhs-notes-publish-time.js --apply");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
