/**
 * 在无 DATABASE_URL / Supabase CLI 时，用 REST + anon key 应用 020 迁移（与 SQL 等效，可重复执行）
 * 运行：node scripts/apply-020-title-pattern.cjs
 */
const fs = require("fs");
const path = require("path");

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
    process.env[key] = val;
  }
}

const DOC_CONTENT = `每次生成内容时，同时生成以下变体标题：

1. 悬念型：用疑问或未完成的句子制造好奇心，让人想点进来看答案
2. 数据型：用具体数字或对比数据开头，给人信息量的感觉
3. 情绪型：用第一人称真实感受切入，引发共鸣
4. 反转型：先说一个常见认知，再推翻它，制造反差
5. 对话型：像在跟朋友说话，口语化，亲切感强`;

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const catName = "标题套路";
  const listCat = `${url}/rest/v1/doc_categories?select=id,name&name=eq.${encodeURIComponent(catName)}`;
  let catRes = await fetch(listCat, { headers: { ...headers, Prefer: "return=minimal" } });
  if (!catRes.ok) {
    console.error("查询类别失败:", catRes.status, await catRes.text());
    process.exit(1);
  }
  let rows = await catRes.json();
  let categoryId;

  if (rows?.length) {
    categoryId = rows[0].id;
    console.log("[跳过] 类别已存在:", catName, "→", categoryId);
  } else {
    const ins = await fetch(`${url}/rest/v1/doc_categories`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: catName,
        icon: "🏷️",
        description: "定义 AI 生成标题时的变体类型",
        is_auto_include: false,
        sort_order: 6,
      }),
    });
    if (!ins.ok) {
      console.error("插入类别失败:", ins.status, await ins.text());
      process.exit(1);
    }
    const created = await ins.json();
    categoryId = Array.isArray(created) ? created[0].id : created.id;
    console.log("[新建] 类别:", catName, "→", categoryId);
  }

  const docTitle = "默认标题套路";
  const listDoc = `${url}/rest/v1/docs?select=id,title&category_id=eq.${categoryId}&title=eq.${encodeURIComponent(docTitle)}`;
  const docRes = await fetch(listDoc, { headers: { ...headers, Prefer: "return=minimal" } });
  if (!docRes.ok) {
    console.error("查询文档失败:", docRes.status, await docRes.text());
    process.exit(1);
  }
  const docRows = await docRes.json();
  if (docRows?.length) {
    console.log("[跳过] 文档已存在:", docTitle);
    console.log("完成（无需变更）。");
    return;
  }

  const insDoc = await fetch(`${url}/rest/v1/docs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      category_id: categoryId,
      title: docTitle,
      content: DOC_CONTENT,
      sort_order: 0,
    }),
  });
  if (!insDoc.ok) {
    console.error("插入文档失败:", insDoc.status, await insDoc.text());
    process.exit(1);
  }
  console.log("[新建] 文档:", docTitle);
  console.log("完成。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
