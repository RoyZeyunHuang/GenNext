/**
 * 将 import/app.db (XHS/IG) 迁移到 Supabase
 * 使用方式：node scripts/migrate-xhs-sqlite-to-supabase.js
 * 环境变量：.env.local 中的 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
 * 要求：先执行 supabase/migrations/006_xhs_tables.sql 建表
 */

const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const Database = require("better-sqlite3");

const BATCH_SIZE = 100;

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

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("请配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const sqlitePath = path.resolve(process.cwd(), "import", "app.db");
if (!fs.existsSync(sqlitePath)) {
  console.error("未找到 import/app.db");
  process.exit(1);
}

const db = new Database(sqlitePath, { readonly: true });
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateTable(name, options) {
  const { selectCols, insertCols, onConflict } = options;
  const rows = db.prepare(`SELECT ${selectCols} FROM ${name}`).all();
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => {
      const out = {};
      for (const c of insertCols) {
        if (Object.prototype.hasOwnProperty.call(row, c)) out[c] = row[c] ?? null;
      }
      return out;
    });
    const { error } = await supabase.from(name).upsert(batch, {
      onConflict: Array.isArray(onConflict) ? onConflict.join(",") : onConflict,
      ignoreDuplicates: true,
    });
    if (error) {
      console.error(`${name} 批次插入失败:`, error.message);
      throw error;
    }
    count += batch.length;
  }
  return count;
}

async function main() {
  const counts = {};

  try {
    // 1. core_posts (不含 raw，SQLite 无 raw；含 publish_time_norm)
    counts.core_posts = await migrateTable("core_posts", {
      selectCols: "post_key, account_nickname, account_xhs_id, title, cover_url, link, note_id, content, brand, category, note_type, keywords, publish_time, title_norm, link_norm, publish_time_norm, created_at, updated_at",
      insertCols: ["post_key", "account_nickname", "account_xhs_id", "title", "cover_url", "link", "note_id", "content", "brand", "category", "note_type", "keywords", "publish_time", "title_norm", "link_norm", "publish_time_norm", "created_at", "updated_at"],
      onConflict: "post_key",
    });
    console.log("core_posts:", counts.core_posts);

    // 2. dict_posts
    counts.dict_posts = await migrateTable("dict_posts", {
      selectCols: "dict_key, note_id, link, link_norm, title, title_norm, cover_url, account_nickname, account_xhs_id, content, brand, category, note_type, keywords, publish_time, updated_at",
      insertCols: ["dict_key", "note_id", "link", "link_norm", "title", "title_norm", "cover_url", "account_nickname", "account_xhs_id", "content", "brand", "category", "note_type", "keywords", "publish_time", "updated_at"],
      onConflict: "dict_key",
    });
    console.log("dict_posts:", counts.dict_posts);

    // 3. post_attributes
    counts.post_attributes = await migrateTable("post_attributes", {
      selectCols: "post_key, ae, building, updated_at, updated_by",
      insertCols: ["post_key", "ae", "building", "updated_at", "updated_by"],
      onConflict: "post_key",
    });
    console.log("post_attributes:", counts.post_attributes);

    // 4. paid_metrics_daily（跳过 raw_metrics_json）
    counts.paid_metrics_daily = await migrateTable("paid_metrics_daily", {
      selectCols: "post_key, event_date, spend, impressions, clicks, ctr, cpc, cpm, interactions, cpe, play_5s, completion_5s, new_seed, new_seed_cost, new_deep_seed, new_deep_seed_cost, dm_in, dm_open, dm_lead, dm_in_cost, dm_open_cost, dm_lead_cost, shop_orders_15d, shop_order_cvr_15d, shop_visits_15d, shop_visit_rate_15d, run_id, updated_at",
      insertCols: ["post_key", "event_date", "spend", "impressions", "clicks", "ctr", "cpc", "cpm", "interactions", "cpe", "play_5s", "completion_5s", "new_seed", "new_seed_cost", "new_deep_seed", "new_deep_seed_cost", "dm_in", "dm_open", "dm_lead", "dm_in_cost", "dm_open_cost", "dm_lead_cost", "shop_orders_15d", "shop_order_cvr_15d", "shop_visits_15d", "shop_visit_rate_15d", "run_id", "updated_at"],
      onConflict: "post_key,event_date",
    });
    console.log("paid_metrics_daily:", counts.paid_metrics_daily);

    // 5. xhs_post_metrics_snapshots（跳过 raw_metrics_json）
    counts.xhs_post_metrics_snapshots = await migrateTable("xhs_post_metrics_snapshots", {
      selectCols: "post_key, snapshot_date, genre, exposure, views, cover_ctr, likes, comments, collects, follows, shares, avg_watch_time, danmaku, run_id, updated_at",
      insertCols: ["post_key", "snapshot_date", "genre", "exposure", "views", "cover_ctr", "likes", "comments", "collects", "follows", "shares", "avg_watch_time", "danmaku", "run_id", "updated_at"],
      onConflict: "post_key,snapshot_date",
    });
    console.log("xhs_post_metrics_snapshots:", counts.xhs_post_metrics_snapshots);

    // 6. daily_top30_snapshot（跳过 raw_metrics_json）
    counts.daily_top30_snapshot = await migrateTable("daily_top30_snapshot", {
      selectCols: "snapshot_date, post_key, note_id, account_nickname, account_xhs_id, views, likes, collects, comments, shares, run_id, updated_at",
      insertCols: ["snapshot_date", "post_key", "note_id", "account_nickname", "account_xhs_id", "views", "likes", "collects", "comments", "shares", "run_id", "updated_at"],
      onConflict: "snapshot_date,post_key",
    });
    console.log("daily_top30_snapshot:", counts.daily_top30_snapshot);

    // 7. core_ig_posts
    counts.core_ig_posts = await migrateTable("core_ig_posts", {
      selectCols: "post_key, ig_post_id, account_id, account_username, account_name, description, duration_sec, publish_time, permalink, post_type, created_at, updated_at",
      insertCols: ["post_key", "ig_post_id", "account_id", "account_username", "account_name", "description", "duration_sec", "publish_time", "permalink", "post_type", "created_at", "updated_at"],
      onConflict: "post_key",
    });
    console.log("core_ig_posts:", counts.core_ig_posts);

    // 8. ig_post_metrics_snapshots（跳过 raw_metrics_json）
    counts.ig_post_metrics_snapshots = await migrateTable("ig_post_metrics_snapshots", {
      selectCols: "post_key, snapshot_date, views, reach, likes, comments, saves, shares, follows, run_id, updated_at",
      insertCols: ["post_key", "snapshot_date", "views", "reach", "likes", "comments", "saves", "shares", "follows", "run_id", "updated_at"],
      onConflict: "post_key,snapshot_date",
    });
    console.log("ig_post_metrics_snapshots:", counts.ig_post_metrics_snapshots);

    // 9. kpi_registry
    counts.kpi_registry = await migrateTable("kpi_registry", {
      selectCols: "kpi_key, group_key, label, enabled, order_no, baseline_text, target_text, good_direction, config_json, updated_at",
      insertCols: ["kpi_key", "group_key", "label", "enabled", "order_no", "baseline_text", "target_text", "good_direction", "config_json", "updated_at"],
      onConflict: "kpi_key",
    });
    console.log("kpi_registry:", counts.kpi_registry);

    // 10. campaign_reports
    counts.campaign_reports = await migrateTable("campaign_reports", {
      selectCols: "id, title, summary, date_from, date_to, aggregate_json, top_posts_json, created_at",
      insertCols: ["id", "title", "summary", "date_from", "date_to", "aggregate_json", "top_posts_json", "created_at"],
      onConflict: "id",
    });
    console.log("campaign_reports:", counts.campaign_reports);
  } finally {
    db.close();
  }

  console.log("\n========== 迁移汇总 ==========");
  const tables = [
    "core_posts",
    "dict_posts",
    "post_attributes",
    "paid_metrics_daily",
    "xhs_post_metrics_snapshots",
    "daily_top30_snapshot",
    "core_ig_posts",
    "ig_post_metrics_snapshots",
    "kpi_registry",
    "campaign_reports",
  ];
  tables.forEach((t) => console.log(`${t}: ${counts[t] ?? 0} 条`));
  console.log("==============================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
