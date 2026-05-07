#!/usr/bin/env node
/**
 * 暂停 campaign。worker 通过 claim_due_emails RPC 已自动跳过 status != 'active' 的 campaign。
 *
 *   node ... pause-campaign.mjs <campaign_id>
 */
import { supabase, out, fail } from "../lib/db.mjs";

const id = process.argv[2];
if (!id) fail("用法: pause-campaign.mjs <campaign_id>");

const { data, error } = await supabase
  .from("email_campaigns")
  .update({ status: "paused" })
  .eq("id", id)
  .select("id, name, status")
  .single();
if (error || !data) fail(`暂停失败: ${error?.message ?? "not found"}`);

const { count } = await supabase
  .from("emails")
  .select("id", { head: true, count: "exact" })
  .eq("campaign_id", id)
  .eq("status", "scheduled");

out({ campaign: data, scheduled_remaining: count ?? 0 });
