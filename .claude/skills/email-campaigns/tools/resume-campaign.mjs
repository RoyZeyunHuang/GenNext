#!/usr/bin/env node
/**
 * 把 paused campaign 恢复 active。
 *
 *   node ... resume-campaign.mjs <campaign_id>
 */
import { supabase, out, fail } from "../lib/db.mjs";

const id = process.argv[2];
if (!id) fail("用法: resume-campaign.mjs <campaign_id>");

const { data, error } = await supabase
  .from("email_campaigns")
  .update({ status: "active" })
  .eq("id", id)
  .select("id, name, status")
  .single();
if (error || !data) fail(`恢复失败: ${error?.message ?? "not found"}`);

const { count } = await supabase
  .from("emails")
  .select("id", { head: true, count: "exact" })
  .eq("campaign_id", id)
  .eq("status", "scheduled");

out({ campaign: data, scheduled_remaining: count ?? 0 });
