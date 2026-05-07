#!/usr/bin/env node
/**
 * Email Campaign Worker
 *
 * 长跑进程,每 60s 扫一次 emails 表,把 status='scheduled' 且 scheduled_at <= now()
 * 的行通过 Resend 发出,更新状态。多实例安全(用 claim_due_emails RPC 原子锁定)。
 *
 * 启动:
 *   node --env-file=../../.env.local apps/email-worker/index.mjs
 *
 * 部署 launchd(开机自启):
 *   ./apps/email-worker/install-launchd.sh
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────────
const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 60_000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 10);
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);
const STUCK_RECLAIM_MINUTES = Number(process.env.WORKER_STUCK_MINUTES ?? 5);
const RECLAIM_EVERY_N_TICKS = 5;
const PER_SEND_DELAY_MS = Number(process.env.WORKER_PER_SEND_DELAY_MS ?? 500);
const HEALTHCHECK_URL = process.env.WORKER_HEALTHCHECK_URL?.trim() || null;

const WORKER_ID = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || "INVO by USWOO";
const DEFAULT_CC = process.env.DEFAULT_CC_EMAIL || null;
const DEFAULT_BCC = process.env.DEFAULT_BCC_EMAIL || null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[fatal] 缺少 Supabase 配置 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}
if (!RESEND_API_KEY) {
  console.error("[fatal] 缺少 RESEND_API_KEY");
  process.exit(1);
}
if (!SENDER_EMAIL) {
  console.error("[fatal] 缺少 SENDER_EMAIL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const resend = new Resend(RESEND_API_KEY);

// ─────────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────────
const log = (...args) => console.log(new Date().toISOString(), `[${WORKER_ID}]`, ...args);
const err = (...args) => console.error(new Date().toISOString(), `[${WORKER_ID}]`, ...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtmlToPlain(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddressList(s) {
  if (!s?.trim()) return undefined;
  const arr = s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

function looksLikeHtml(body) {
  return /<\w+[\s>]/.test(body || "");
}

// ─────────────────────────────────────────────────────────────────
// 发送一封信
// ─────────────────────────────────────────────────────────────────
async function sendOne(row) {
  const to = (row.to_email ?? "").trim();
  if (!to) throw new Error("空 to_email");

  const fromEmail = (row.from_email ?? SENDER_EMAIL).trim();
  const fromHeader = `${RESEND_FROM_NAME} <${fromEmail}>`;
  const cc = parseAddressList(DEFAULT_CC);
  const bcc = parseAddressList(DEFAULT_BCC);
  const isHtml = looksLikeHtml(row.body);

  const common = {
    from: fromHeader,
    to: [to],
    subject: row.subject ?? "",
    headers: { "X-Entity-Ref-ID": randomUUID() },
    ...(cc?.length ? { cc } : {}),
    ...(bcc?.length ? { bcc } : {}),
  };

  const result = isHtml
    ? await resend.emails.send({
        ...common,
        html: row.body ?? "",
        text: stripHtmlToPlain(row.body ?? "") || " ",
      })
    : await resend.emails.send({ ...common, text: row.body ?? "" });

  if (result.error) {
    const msg =
      typeof result.error === "object" && result.error && "message" in result.error
        ? String(result.error.message)
        : "Resend 发送失败";
    throw new Error(msg);
  }
  return result.data?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────
// outreach 同步(对应 src/lib/outreach-after-send.ts 的核心逻辑)
// ─────────────────────────────────────────────────────────────────
async function updateOutreachAfterEmailSent(propertyId) {
  if (!propertyId) return;
  const nowIso = new Date().toISOString();
  const { data: outreach } = await supabase
    .from("outreach")
    .select("id, stage")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (!outreach) {
    await supabase.from("outreach").insert({
      property_id: propertyId,
      stage: "Pitched",
      deal_status: "Active",
      last_email_at: nowIso,
    });
    return;
  }

  const updates = { last_email_at: nowIso };
  if (!outreach.stage || outreach.stage === "Not Started") {
    updates.stage = "Pitched";
  }
  await supabase.from("outreach").update(updates).eq("id", outreach.id);
}

// ─────────────────────────────────────────────────────────────────
// 主循环
// ─────────────────────────────────────────────────────────────────
let stopping = false;
let tickCount = 0;

async function tick() {
  tickCount++;

  if (tickCount % RECLAIM_EVERY_N_TICKS === 0) {
    const { data: reclaimed, error: rcErr } = await supabase.rpc("reclaim_stuck_emails", {
      p_stuck_minutes: STUCK_RECLAIM_MINUTES,
    });
    if (rcErr) err("reclaim_stuck_emails 出错:", rcErr.message);
    else if (reclaimed > 0) log(`回收卡死行 ${reclaimed} 条`);
  }

  const { data: claimed, error: claimErr } = await supabase.rpc("claim_due_emails", {
    p_worker_id: WORKER_ID,
    p_limit: BATCH_SIZE,
  });
  if (claimErr) {
    err("claim_due_emails 出错:", claimErr.message);
    return;
  }
  const rows = claimed ?? [];
  if (rows.length === 0) return;

  log(`认领 ${rows.length} 条待发`);

  for (const row of rows) {
    try {
      const resendId = await sendOne(row);
      const nowIso = new Date().toISOString();
      await supabase
        .from("emails")
        .update({
          status: "sent",
          sent_at: nowIso,
          resend_id: resendId,
          locked_at: null,
          locked_by: null,
          last_error: null,
        })
        .eq("id", row.id);
      await updateOutreachAfterEmailSent(row.property_id);
      log(`✓ 发送 #${row.id} → ${row.to_email}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = row.attempts ?? 0;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await supabase
        .from("emails")
        .update({
          status: giveUp ? "failed" : "scheduled",
          last_error: message,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", row.id);
      err(
        giveUp
          ? `✗ 放弃 #${row.id} (${attempts} 次失败) → ${row.to_email}: ${message}`
          : `↻ 重排 #${row.id} (第 ${attempts} 次失败) → ${row.to_email}: ${message}`
      );
    }
    await sleep(PER_SEND_DELAY_MS);
  }
}

async function pingHealthcheck() {
  if (!HEALTHCHECK_URL) return;
  try {
    await fetch(HEALTHCHECK_URL, { method: "GET" });
  } catch {
    // 不影响主流程
  }
}

async function main() {
  log(`启动 (tick=${TICK_MS}ms batch=${BATCH_SIZE} maxAttempts=${MAX_ATTEMPTS})`);

  process.on("SIGINT", () => {
    log("收到 SIGINT,优雅退出...");
    stopping = true;
  });
  process.on("SIGTERM", () => {
    log("收到 SIGTERM,优雅退出...");
    stopping = true;
  });

  while (!stopping) {
    try {
      await tick();
      await pingHealthcheck();
    } catch (e) {
      err("tick 异常:", e instanceof Error ? e.stack : String(e));
    }
    if (stopping) break;
    await sleep(TICK_MS);
  }
  log("已退出");
  process.exit(0);
}

main().catch((e) => {
  err("致命错误:", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
