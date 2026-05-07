#!/usr/bin/env node
/**
 * 列所有 campaign + 进度概览。
 *
 *   --status <active|paused|done|cancelled>   过滤
 *   --limit <n>                                默认 50
 */
import { supabase, parseArgs, out, fail } from "../lib/db.mjs";

const args = parseArgs(process.argv.slice(2));
const status = args.status;
const limit = Number(args.limit ?? 50);

let q = supabase
  .from("email_campaigns")
  .select("id, name, template_id, status, notes, created_at, updated_at")
  .order("created_at", { ascending: false })
  .limit(limit);
if (status) q = q.eq("status", status);

const { data: campaigns, error } = await q;
if (error) fail(error.message);

const ids = (campaigns ?? []).map((c) => c.id);
let statsByCampaign = new Map();
if (ids.length > 0) {
  const { data: emails } = await supabase
    .from("emails")
    .select("campaign_id, status")
    .in("campaign_id", ids);
  for (const e of emails ?? []) {
    if (!e.campaign_id) continue;
    let m = statsByCampaign.get(e.campaign_id);
    if (!m) {
      m = { scheduled: 0, sending: 0, sent: 0, delivered: 0, opened: 0, bounced: 0, failed: 0, cancelled: 0, total: 0 };
      statsByCampaign.set(e.campaign_id, m);
    }
    m.total++;
    if (m[e.status] != null) m[e.status]++;
  }
}

const rows = (campaigns ?? []).map((c) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  template_id: c.template_id,
  created_at: c.created_at,
  notes: c.notes,
  stats: statsByCampaign.get(c.id) ?? { total: 0 },
}));

out({ count: rows.length, campaigns: rows });
