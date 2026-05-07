#!/usr/bin/env node
/**
 * 真创建 campaign:在 email_campaigns 插入一行 + 在 emails 批量插入 N 行 status='scheduled'。
 * **必须传 --confirm 才会写库**,否则跟 preview 等价。
 *
 *   --template <id>            必填
 *   --contacts <id,id,id>      必填(顺序决定 scheduled_at 顺序)
 *   --schedule '<json>'        必填
 *   --name <name>              必填(campaign name)
 *   --notes <text>             可选(留 skill 跟用户的对话摘要)
 *   --confirm                  必填,真写库
 *   --ignore-cooldown          可选,跳过 7 天冷却检查
 */
import { supabase, parseArgs, out, fail } from "../lib/db.mjs";
import { applyTemplate, buildTemplateVars, wrapEmailHtml } from "../lib/render.mjs";
import { computeSchedule } from "../lib/schedule.mjs";

const COOLDOWN_DAYS = 7;

const args = parseArgs(process.argv.slice(2));
if (!args.template) fail("缺少 --template");
if (!args.contacts) fail("缺少 --contacts");
if (!args.schedule) fail("缺少 --schedule");
if (!args.name) fail("缺少 --name");
if (!args.confirm) fail("缺少 --confirm,拒绝写库。先用 preview-campaign 给用户确认。");

let spec;
try {
  spec = JSON.parse(args.schedule);
} catch (e) {
  fail(`--schedule 不是合法 JSON: ${e.message}`);
}

const contactIds = String(args.contacts).split(",").map((s) => s.trim()).filter(Boolean);
const senderEmail = (process.env.SENDER_EMAIL ?? "").trim();
if (!senderEmail) fail("缺少 SENDER_EMAIL 环境变量");

// 1. 拉模板 + 联系人详情
const { data: tpl, error: tErr } = await supabase
  .from("email_templates")
  .select("id, name, subject, body")
  .eq("id", args.template)
  .single();
if (tErr || !tpl) fail(`找不到模板: ${tErr?.message ?? "not found"}`);

const { data: contacts, error: cErr } = await supabase
  .from("contacts")
  .select(
    "id, name, email, company_id, companies(id, name, property_companies(role, properties(id, name, area, city, address, build_year, units)))"
  )
  .in("id", contactIds);
if (cErr) fail(cErr.message);

const byId = new Map((contacts ?? []).map((c) => [c.id, c]));
const ordered = contactIds.map((id) => byId.get(id)).filter(Boolean);

// 2. 渲染 + 过滤
const rendered = [];
const skipped = [];
for (const c of ordered) {
  if (!c.email?.trim()) {
    skipped.push({ contact_id: c.id, name: c.name, reason: "无 email" });
    continue;
  }
  const company = c.companies;
  const properties = (company?.property_companies ?? [])
    .map((pc) => ({ ...pc.properties, role: pc.role }))
    .filter((p) => p?.id);
  if (properties.length === 0) {
    skipped.push({ contact_id: c.id, name: c.name, reason: "无关联楼盘" });
    continue;
  }
  const vars = buildTemplateVars(c, company, properties);
  const subject = applyTemplate(tpl.subject, vars);
  const body = applyTemplate(tpl.body, vars);
  const html = wrapEmailHtml({
    bodyContent: body,
    propertyName: vars.property_name,
    senderName: undefined,
    senderEmail,
  });
  rendered.push({
    contact_id: c.id,
    company_id: c.company_id,
    property_id: properties[0].id,
    to_email: c.email.trim(),
    subject,
    html,
  });
}

// 3. 7 天冷却检查
if (!args["ignore-cooldown"]) {
  const propertyIds = Array.from(new Set(rendered.map((r) => r.property_id).filter(Boolean)));
  if (propertyIds.length > 0) {
    const { data: outreaches } = await supabase
      .from("outreach")
      .select("property_id, last_email_at")
      .in("property_id", propertyIds);
    const cutoff = Date.now() - COOLDOWN_DAYS * 24 * 3600_000;
    const recentlyContacted = new Set();
    for (const o of outreaches ?? []) {
      if (!o.last_email_at) continue;
      const t = new Date(o.last_email_at).getTime();
      if (t > cutoff) recentlyContacted.add(o.property_id);
    }
    if (recentlyContacted.size > 0) {
      const blocked = rendered.filter((r) => recentlyContacted.has(r.property_id));
      if (blocked.length > 0) {
        fail(
          `冷却期阻止 ${blocked.length} 行(7 天内已联系过其楼盘)。要强制发请加 --ignore-cooldown。\n阻止的 contact_id: ${blocked.map((b) => b.contact_id).join(",")}`
        );
      }
    }
  }
}

if (rendered.length === 0) {
  fail(`无可发送行(全部被跳过 ${skipped.length} 条)。详情:${JSON.stringify(skipped)}`);
}

// 4. schedule 计算
const schedule = computeSchedule(spec, rendered.length);

// 5. 创建 campaign
const { data: campaign, error: campErr } = await supabase
  .from("email_campaigns")
  .insert({
    name: args.name,
    template_id: tpl.id,
    status: "active",
    notes: args.notes ?? null,
    created_by: "skill:email-campaigns",
  })
  .select("id, name")
  .single();
if (campErr) fail(`创建 campaign 失败: ${campErr.message}`);

// 6. 批量 insert emails
const emailRows = rendered.map((r, i) => ({
  company_id: r.company_id,
  property_id: r.property_id,
  contact_id: r.contact_id,
  campaign_id: campaign.id,
  template_id: tpl.id,
  direction: "sent",
  from_email: senderEmail,
  to_email: r.to_email,
  subject: r.subject,
  body: r.html,
  status: "scheduled",
  scheduled_at: schedule[i],
  attempts: 0,
}));

// 分批插入(Postgres 不限,但 PostgREST 默认有大小限制)
const CHUNK = 100;
let inserted = 0;
for (let i = 0; i < emailRows.length; i += CHUNK) {
  const batch = emailRows.slice(i, i + CHUNK);
  const { error: insErr } = await supabase.from("emails").insert(batch);
  if (insErr) {
    // 不回滚 campaign(留下来给用户能看到部分进度);改成 paused 防 worker 误发
    await supabase
      .from("email_campaigns")
      .update({ status: "paused", notes: `${args.notes ?? ""}\n[skill 错误] insert 失败: ${insErr.message}` })
      .eq("id", campaign.id);
    fail(`插入 emails 失败(已暂停 campaign): ${insErr.message}`);
  }
  inserted += batch.length;
}

out({
  campaign_id: campaign.id,
  campaign_name: campaign.name,
  template: { id: tpl.id, name: tpl.name },
  inserted,
  skipped,
  first_scheduled_at: schedule[0] ?? null,
  last_scheduled_at: schedule[schedule.length - 1] ?? null,
  next_steps: [
    "确认 worker 在跑: launchctl list | grep com.gennext.email-worker",
    "查看 worker 日志: tail -f /tmp/gennext-email-worker.log",
    `查看进度: node --env-file=.env.local .claude/skills/email-campaigns/tools/campaign-status.mjs ${campaign.id}`,
  ],
});
