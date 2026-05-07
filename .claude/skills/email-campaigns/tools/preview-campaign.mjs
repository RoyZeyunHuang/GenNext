#!/usr/bin/env node
/**
 * 预览 campaign:渲染模板,计算 schedule,返回所有待写入行的预览。**不写库**。
 *
 *   --template <template_id>   必填
 *   --contacts <id,id,id>      必填(联系人顺序决定 scheduled_at 顺序)
 *   --schedule '<json>'        必填(spec 字段见 SKILL.md)
 *   --name <name>              可选,展示用
 */
import { supabase, parseArgs, out, fail } from "../lib/db.mjs";
import { applyTemplate, buildTemplateVars, wrapEmailHtml } from "../lib/render.mjs";
import { computeSchedule } from "../lib/schedule.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.template) fail("缺少 --template <template_id>");
if (!args.contacts) fail("缺少 --contacts <id,id,id>");
if (!args.schedule) fail("缺少 --schedule '<json>'");

let spec;
try {
  spec = JSON.parse(args.schedule);
} catch (e) {
  fail(`--schedule 不是合法 JSON: ${e.message}`);
}

const contactIds = String(args.contacts).split(",").map((s) => s.trim()).filter(Boolean);

const { data: tpl, error: tErr } = await supabase
  .from("email_templates")
  .select("id, name, subject, body")
  .eq("id", args.template)
  .single();
if (tErr || !tpl) fail(`找不到模板 ${args.template}: ${tErr?.message ?? "not found"}`);

const { data: contacts, error: cErr } = await supabase
  .from("contacts")
  .select(
    "id, name, email, company_id, companies(id, name, property_companies(role, properties(id, name, area, city, address, build_year, units)))"
  )
  .in("id", contactIds);
if (cErr) fail(cErr.message);

const byId = new Map((contacts ?? []).map((c) => [c.id, c]));
const ordered = contactIds.map((id) => byId.get(id)).filter(Boolean);

const senderEmail = process.env.SENDER_EMAIL || "";
const fromName = process.env.RESEND_FROM_NAME || "INVO by USWOO";

const rows = [];
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
    skipped.push({ contact_id: c.id, name: c.name, reason: "无关联楼盘,模板渲染缺变量" });
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
  rows.push({
    contact_id: c.id,
    contact_name: c.name,
    to_email: c.email.trim(),
    company_id: c.company_id,
    company_name: company?.name ?? null,
    primary_property_id: properties[0].id,
    subject,
    body_preview: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240),
    html,
    vars,
  });
}

const schedule = computeSchedule(spec, rows.length);
const previewRows = rows.map((r, i) => ({
  ...r,
  html: undefined, // 渲染后的完整 HTML 太长,预览不返回(create-campaign 会重新渲染并写库)
  scheduled_at: schedule[i],
}));

out({
  template: { id: tpl.id, name: tpl.name },
  campaign_name: args.name ?? null,
  spec,
  count: previewRows.length,
  skipped,
  sender_email: senderEmail,
  rows: previewRows,
});
