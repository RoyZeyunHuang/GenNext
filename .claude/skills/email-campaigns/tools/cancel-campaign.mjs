#!/usr/bin/env node
/**
 * 取消 campaign。**不可逆**。campaign → cancelled,所有 scheduled emails → cancelled。
 * 必须传 --confirm。
 *
 *   node ... cancel-campaign.mjs <campaign_id> --confirm
 */
import { supabase, parseArgs, out, fail } from "../lib/db.mjs";

const id = process.argv[2];
if (!id) fail("用法: cancel-campaign.mjs <campaign_id> --confirm");
const args = parseArgs(process.argv.slice(3));
if (!args.confirm) fail("缺少 --confirm。取消不可逆,先跟用户确认再加 --confirm。");

const { data: campaign, error: cErr } = await supabase
  .from("email_campaigns")
  .update({ status: "cancelled" })
  .eq("id", id)
  .select("id, name, status")
  .single();
if (cErr || !campaign) fail(`取消失败: ${cErr?.message ?? "not found"}`);

const { count: cancelledCount, error: eErr } = await supabase
  .from("emails")
  .update({ status: "cancelled" })
  .eq("campaign_id", id)
  .eq("status", "scheduled")
  .select("id", { count: "exact", head: true });
if (eErr) fail(`emails 标记 cancelled 失败: ${eErr.message}`);

out({ campaign, emails_cancelled: cancelledCount ?? 0 });
