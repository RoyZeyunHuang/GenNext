#!/usr/bin/env node
/**
 * Apply persona overlay columns to news_feed via Supabase REST.
 * Run: node --env-file=.env.local scripts/apply-persona-overlay-migration.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("缺少环境变量"); process.exit(1); }

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Test by trying to update a row with the new columns — if columns don't exist, use rpc
async function main() {
  // Try a simple select to see if columns exist
  const { data, error } = await supabase
    .from("news_feed")
    .select("id, persona_name")
    .limit(1);

  if (error && error.message.includes("persona_name")) {
    console.log("列不存在，需要通过 SQL 添加。尝试 rpc...");
    // Try using rpc to execute raw SQL
    const { error: rpcErr } = await supabase.rpc("exec_sql", {
      sql: `
        alter table public.news_feed
          add column if not exists persona_name  text,
          add column if not exists persona_id    uuid,
          add column if not exists persona_title text,
          add column if not exists persona_body  text,
          add column if not exists persona_angle text;
      `,
    });
    if (rpcErr) {
      console.error("RPC 执行失败:", rpcErr.message);
      console.log("\n请手动在 Supabase Dashboard > SQL Editor 执行以下 SQL：");
      console.log(`
alter table public.news_feed
  add column if not exists persona_name  text,
  add column if not exists persona_id    uuid,
  add column if not exists persona_title text,
  add column if not exists persona_body  text,
  add column if not exists persona_angle text;
      `);
      process.exit(1);
    }
    console.log("✅ 列已添加");
  } else if (error) {
    console.error("查询出错:", error.message);
    process.exit(1);
  } else {
    console.log("✅ persona_name 列已存在，无需 migration");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
