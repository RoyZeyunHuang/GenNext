#!/usr/bin/env node
/**
 * 清理 news_feed 表中的重复新闻。
 *
 * 去重逻辑（优先级从高到低）：
 *   1. 完全相同 source_url → 保留最早入库的一条
 *   2. 完全相同标题 → 保留最早入库的一条
 *   3. 标题相似度 > 0.80（归一化编辑距离）→ 保留最早的
 *   4. 内容前 200 字完全一样 → 保留最早的
 *
 * 先 dry-run 输出报告，加 --apply 才真正删除。
 *
 * Run:
 *   node --env-file=.env.local scripts/dedup-news-feed.mjs          # dry run
 *   node --env-file=.env.local scripts/dedup-news-feed.mjs --apply  # 真正删除
 *   node --env-file=.env.local scripts/dedup-news-feed.mjs --list   # 列出所有标题
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const LIST = process.argv.includes("--list");

function similarity(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const dp = Array.from({ length: la + 1 }, (_, i) => {
    const row = new Array(lb + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++)
    for (let j = 1; j <= lb; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return 1 - dp[la][lb] / Math.max(la, lb);
}

function norm(t) {
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

async function main() {
  console.log(`模式: ${APPLY ? "⚡ 真正删除" : LIST ? "📋 列出所有" : "🔍 预览（加 --apply 执行删除）"}\n`);

  const all = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("news_feed")
      .select("id, title, summary, content, source_url, source_name, published_at, created_at")
      .order("created_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`共 ${all.length} 条新闻\n`);

  if (LIST) {
    for (const a of all) {
      const d = new Date(a.published_at).toLocaleDateString("zh-CN");
      console.log(`  [${d}] ${a.source_name || "?"} | ${a.title.slice(0, 80)}`);
      if (a.source_url) console.log(`         ${a.source_url}`);
    }
    return;
  }

  const toDelete = new Set();
  const reasons = new Map();

  // Phase 1: same source_url
  const urlGroups = new Map();
  for (const a of all) {
    if (!a.source_url) continue;
    const u = a.source_url.trim().replace(/\/$/, "");
    if (!u) continue;
    if (!urlGroups.has(u)) urlGroups.set(u, []);
    urlGroups.get(u).push(a);
  }
  for (const [u, items] of urlGroups) {
    if (items.length <= 1) continue;
    const sorted = items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < sorted.length; i++) {
      toDelete.add(sorted[i].id);
      reasons.set(sorted[i].id, `相同URL: ${u.slice(0, 60)}`);
    }
  }
  console.log(`相同 source_url 重复: ${[...urlGroups.values()].reduce((s, g) => s + Math.max(0, g.length - 1), 0)} 条`);

  // Phase 2: exact title
  const titleGroups = new Map();
  for (const a of all) {
    if (toDelete.has(a.id)) continue;
    const k = norm(a.title);
    if (!titleGroups.has(k)) titleGroups.set(k, []);
    titleGroups.get(k).push(a);
  }
  let exactDups = 0;
  for (const [, items] of titleGroups) {
    if (items.length <= 1) continue;
    const sorted = items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < sorted.length; i++) {
      toDelete.add(sorted[i].id);
      reasons.set(sorted[i].id, `完全相同标题: ${sorted[0].title.slice(0, 50)}`);
      exactDups++;
    }
  }
  console.log(`完全相同标题重复: ${exactDups} 条`);

  // Phase 3: fuzzy title similarity
  const remaining = all.filter((a) => !toDelete.has(a.id));
  let fuzzyDups = 0;
  for (let i = 0; i < remaining.length; i++) {
    if (toDelete.has(remaining[i].id)) continue;
    const ti = norm(remaining[i].title);
    for (let j = i + 1; j < remaining.length; j++) {
      if (toDelete.has(remaining[j].id)) continue;
      const tj = norm(remaining[j].title);
      if (ti === tj) continue;
      const sim = similarity(ti, tj);
      if (sim >= 0.80) {
        const newer =
          new Date(remaining[i].created_at) > new Date(remaining[j].created_at)
            ? remaining[i] : remaining[j];
        const keeper = newer === remaining[i] ? remaining[j] : remaining[i];
        toDelete.add(newer.id);
        reasons.set(newer.id, `模糊重复(${(sim*100).toFixed(0)}%): "${keeper.title.slice(0,40)}"`);
        fuzzyDups++;
      }
    }
  }
  console.log(`模糊相似重复: ${fuzzyDups} 条`);

  // Phase 4: same content prefix (first 200 chars)
  const remaining2 = all.filter((a) => !toDelete.has(a.id));
  const contentGroups = new Map();
  let contentDups = 0;
  for (const a of remaining2) {
    const prefix = (a.content || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!prefix) continue;
    if (!contentGroups.has(prefix)) contentGroups.set(prefix, []);
    contentGroups.get(prefix).push(a);
  }
  for (const [, items] of contentGroups) {
    if (items.length <= 1) continue;
    const sorted = items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < sorted.length; i++) {
      if (toDelete.has(sorted[i].id)) continue;
      toDelete.add(sorted[i].id);
      reasons.set(sorted[i].id, `相同内容前缀: "${sorted[0].title.slice(0,40)}"`);
      contentDups++;
    }
  }
  console.log(`内容前缀相同重复: ${contentDups} 条`);

  console.log(`\n总计将删除: ${toDelete.size} 条，保留: ${all.length - toDelete.size} 条`);

  if (toDelete.size === 0) {
    console.log("\n✅ 没有重复新闻，无需清理");
    return;
  }

  console.log("\n─── 删除详情 ───");
  for (const [id, reason] of reasons) {
    const a = all.find((x) => x.id === id);
    console.log(`  ✗ ${a?.title?.slice(0, 60) || id}  ← ${reason}`);
  }

  if (!APPLY) {
    console.log("\n⏸  加 --apply 参数真正执行删除。");
    return;
  }

  const ids = [...toDelete];
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await supabase.from("news_bookmarks").delete().in("article_id", batch);
    const { error } = await supabase.from("news_feed").delete().in("id", batch);
    if (error) {
      console.error(`删除出错 (batch ${i}):`, error.message);
    } else {
      deleted += batch.length;
    }
  }
  console.log(`\n✅ 已删除 ${deleted} 条重复新闻`);
}

main().catch((e) => { console.error(e); process.exit(1); });
