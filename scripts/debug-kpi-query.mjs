import { createClient } from "@supabase/supabase-js";

const url = "https://ibfsjpuajcoijqutqonk.supabase.co";
const key = "sb_publishable_cJcSYADl07qYszd7i1YT3A_35p8VbVv";

const supabase = createClient(url, key);

async function main() {
  console.log("=== 1. 测试连接：查 xhs_notes 总行数 ===");
  const { count, error: countErr } = await supabase
    .from("xhs_notes")
    .select("*", { count: "exact", head: true });
  console.log("总行数:", count, "错误:", countErr?.message ?? "无");

  console.log("\n=== 2. 查所有 snapshot_date（去重） ===");
  const { data: allDates, error: dateErr } = await supabase
    .from("xhs_notes")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false });
  if (dateErr) {
    console.log("查询错误:", dateErr.message);
  } else {
    const unique = [...new Set((allDates ?? []).map((r) => String(r.snapshot_date).slice(0, 10)))];
    console.log("去重日期:", unique);
    console.log("原始返回行数:", allDates?.length);
  }

  console.log("\n=== 3. 取前 3 行完整数据（看字段值） ===");
  const { data: sample, error: sampleErr } = await supabase
    .from("xhs_notes")
    .select("*")
    .limit(3);
  if (sampleErr) {
    console.log("查询错误:", sampleErr.message);
  } else {
    for (const row of sample ?? []) {
      console.log(JSON.stringify(row, null, 2));
    }
  }

  console.log("\n=== 4. 模拟 notes-stats：不传 snapshot_date，取最新 ===");
  const { data: latestRow, error: latestErr } = await supabase
    .from("xhs_notes")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (latestErr) {
    console.log("查询错误:", latestErr.message);
  } else {
    const latestDate = latestRow?.[0]?.snapshot_date
      ? String(latestRow[0].snapshot_date).slice(0, 10)
      : null;
    console.log("最新快照日期:", latestDate);

    if (latestDate) {
      console.log(`\n=== 5. 用 snapshot_date=${latestDate} 查所有笔记 ===`);
      const { data: notes, error: notesErr } = await supabase
        .from("xhs_notes")
        .select("*")
        .eq("snapshot_date", latestDate);
      if (notesErr) {
        console.log("查询错误:", notesErr.message);
      } else {
        console.log("查到笔记数:", notes?.length);
        if (notes && notes.length > 0) {
          const first = notes[0];
          console.log("第一条 exposure:", first.exposure, typeof first.exposure);
          console.log("第一条 views:", first.views, typeof first.views);
          console.log("第一条 likes:", first.likes, typeof first.likes);
          console.log("第一条 title:", first.title);
        }
      }
    }
  }

  console.log("\n=== 6. 直接用 fetch 测 /api/kpi/snapshot-dates ===");
  try {
    const res = await fetch("http://localhost:3000/api/kpi/snapshot-dates", { cache: "no-store" });
    const body = await res.text();
    console.log("HTTP 状态:", res.status);
    console.log("返回内容:", body.slice(0, 500));
  } catch (e) {
    console.log("fetch 本地接口失败:", e.message);
  }

  console.log("\n=== 7. 直接用 fetch 测 /api/kpi/notes-stats ===");
  try {
    const res = await fetch("http://localhost:3000/api/kpi/notes-stats", { cache: "no-store" });
    const body = await res.text();
    console.log("HTTP 状态:", res.status);
    console.log("返回内容:", body.slice(0, 1000));
  } catch (e) {
    console.log("fetch 本地接口失败:", e.message);
  }
}

main().catch((e) => console.error("脚本异常:", e));
