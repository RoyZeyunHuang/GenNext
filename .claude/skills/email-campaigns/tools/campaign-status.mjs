#!/usr/bin/env node
/**
 * 单个 campaign 的详细进度。
 *
 *   node ... campaign-status.mjs <campaign_id>
 */
import { supabase, out, fail } from "../lib/db.mjs";

const id = process.argv[2];
if (!id) fail("用法: campaign-status.mjs <campaign_id>");

const { data: campaign, error } = await supabase
  .from("email_campaigns")
  .select("id, name, status, template_id, notes, created_at, updated_at")
  .eq("id", id)
  .single();
if (error || !campaign) fail(`找不到 campaign: ${error?.message ?? "not found"}`);

const { data: emails } = await supabase
  .from("emails")
  .select(
    "id, status, scheduled_at, sent_at, attempts, last_error, to_email, subject, contact_id, property_id, resend_id, opened_at, bounced_at, created_at"
  )
  .eq("campaign_id", id)
  .order("scheduled_at", { ascending: true });

const stats = { scheduled: 0, sending: 0, sent: 0, delivered: 0, opened: 0, bounced: 0, failed: 0, cancelled: 0, total: 0 };
for (const e of emails ?? []) {
  stats.total++;
  if (stats[e.status] != null) stats[e.status]++;
}

const upcoming = (emails ?? [])
  .filter((e) => e.status === "scheduled")
  .slice(0, 10)
  .map((e) => ({
    id: e.id,
    to_email: e.to_email,
    subject: e.subject,
    scheduled_at: e.scheduled_at,
    attempts: e.attempts,
  }));

const recentSent = (emails ?? [])
  .filter((e) => ["sent", "delivered", "opened", "bounced"].includes(e.status))
  .sort((a, b) => new Date(b.sent_at ?? b.created_at).getTime() - new Date(a.sent_at ?? a.created_at).getTime())
  .slice(0, 10)
  .map((e) => ({
    id: e.id,
    to_email: e.to_email,
    status: e.status,
    sent_at: e.sent_at,
    opened_at: e.opened_at,
    bounced_at: e.bounced_at,
    resend_id: e.resend_id,
  }));

const failures = (emails ?? [])
  .filter((e) => e.status === "failed" || (e.last_error && e.attempts > 0))
  .slice(0, 10)
  .map((e) => ({
    id: e.id,
    to_email: e.to_email,
    status: e.status,
    attempts: e.attempts,
    last_error: e.last_error,
  }));

// 拉同期间收到的回复(基于 contact_id 关联的 company → received emails)
const contactIds = Array.from(new Set((emails ?? []).map((e) => e.contact_id).filter(Boolean)));
let replies = [];
if (contactIds.length > 0) {
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, company_id")
    .in("id", contactIds);
  const companyIds = Array.from(new Set((contacts ?? []).map((c) => c.company_id).filter(Boolean)));
  if (companyIds.length > 0) {
    const { data: rcv } = await supabase
      .from("emails")
      .select("id, company_id, from_email, subject, ai_summary, created_at")
      .in("company_id", companyIds)
      .eq("direction", "received")
      .gte("created_at", campaign.created_at)
      .order("created_at", { ascending: false })
      .limit(20);
    replies = (rcv ?? []).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      from: r.from_email,
      subject: r.subject,
      ai_summary: r.ai_summary,
      received_at: r.created_at,
    }));
  }
}

out({ campaign, stats, upcoming, recent_sent: recentSent, failures, replies });
