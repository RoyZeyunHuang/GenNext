import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  applyTemplate,
  buildDeveloperBatchTemplateVars,
  contactFirstName,
  dedupePropertiesByIdPreferHigherUnits,
  isInvoManagedEmailTemplateName,
  invoBaseTemplateNameFromBuildYears,
  resolveContactName,
  resolveInvoMultiDeveloperTemplateName,
  resolveRecipientEmail,
  sleep,
  type BatchPropertyForTemplate,
  type CompanyWithContacts,
} from "@/lib/email-helpers";
import { sendEmail } from "@/lib/resend";
import { getEmailSignatureSettings } from "@/lib/email-signature-settings";
import { wrapEmailHtml } from "@/lib/email-template";
import { updateOutreachAfterEmailSent } from "@/lib/outreach-after-send";
import { mergeRecipientList } from "@/lib/email-recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

async function summarizeSentEmail(body: string): Promise<string | null> {
  if (!body.trim()) return null;
  if (!anthropic.apiKey) return null;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 64,
      system: "你是 BD 邮件分析助手。只输出最终总结，不要输出其它文字。",
      messages: [
        {
          role: "user",
          content: `用一句中文总结这封邮件的核心内容和需要的行动，不超过30字。邮件内容：${body}`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const t = (text || "").trim().slice(0, 30);
    return t || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      company_ids,
      email_template_id,
      subject: customSubject,
      body: customBody,
      previews,
      is_html = true,
      attachment_path,
      cc: bodyCc,
      bcc: bodyBcc,
    } = body as {
      company_ids: string[];
      email_template_id?: string | null;
      subject?: string;
      body?: string;
      /** 默认 true；false 时按纯文本发送（含签名） */
      is_html?: boolean;
      /** 相对 public/，如 invo-deck.pdf */
      attachment_path?: string | null;
      cc?: string | null;
      bcc?: string | null;
      previews?: Array<{
        company_id: string;
        to: string;
        subject: string;
        body: string;
        property_id?: string | null;
        property_ids?: string[] | null;
        property_name?: string | null;
        sender_name?: string;
      }>;
    };

    if (!Array.isArray(company_ids) || company_ids.length === 0) {
      return NextResponse.json({ error: "company_ids 不能为空" }, { status: 400 });
    }

    const useHtml = Boolean(is_html);
    const attach =
      typeof attachment_path === "string" && attachment_path.trim()
        ? attachment_path.trim()
        : undefined;

    const ccMerged = mergeRecipientList(
      typeof bodyCc === "string" ? bodyCc : null,
      process.env.DEFAULT_CC_EMAIL
    );
    const bccMerged = mergeRecipientList(
      typeof bodyBcc === "string" ? bodyBcc : null,
      process.env.DEFAULT_BCC_EMAIL
    );

    const from = (process.env.SENDER_EMAIL || "").trim();
    if (!from) {
      return NextResponse.json({ error: "未配置 SENDER_EMAIL" }, { status: 503 });
    }

    const sig = await getEmailSignatureSettings(supabase);

    let success = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    const failures: Array<{ to: string; error: string }> = [];

    if (previews?.length) {
      for (const p of previews) {
        if (!company_ids.includes(p.company_id)) continue;
        const to = p.to?.trim();
        if (!to) {
          skipped++;
          continue;
        }
        try {
          const outreachIds =
            Array.isArray(p.property_ids) && p.property_ids.length > 0
              ? Array.from(
                  new Set(p.property_ids.map((id) => String(id).trim()).filter(Boolean))
                )
              : p.property_id
                ? [String(p.property_id).trim()]
                : [];
          const primaryPropertyId = (outreachIds[0] ?? p.property_id) || null;

          const senderName =
            p.sender_name?.trim() || sig.senderName;
          const outgoing = useHtml
            ? wrapEmailHtml(
                p.body,
                undefined,
                undefined,
                p.property_name ?? undefined,
                senderName,
                from,
                sig.signatureTitleLine
              )
            : p.body;
          const sendResult = await sendEmail(to, p.subject, outgoing, from, useHtml, {
            senderName,
            attachmentPath: attach,
            cc: ccMerged,
            bcc: bccMerged,
          });
          const ai_summary = await summarizeSentEmail(p.body);
          await supabase.from("emails").insert({
            company_id: p.company_id,
            property_id: primaryPropertyId,
            direction: "sent",
            from_email: from,
            to_email: to,
            subject: p.subject,
            body: p.body,
            ai_summary,
            status: "sent",
            gmail_message_id: null,
            resend_id: sendResult?.id ?? null,
          });
          for (const pid of outreachIds) {
            await updateOutreachAfterEmailSent(supabase, pid);
          }
          success++;
        } catch (e) {
          failed++;
          const errMsg = e instanceof Error ? e.message : String(e);
          errors.push(`${p.company_id}: ${errMsg}`);
          failures.push({ to, error: errMsg });
        }
        await sleep(500);
      }
      return NextResponse.json({ success, skipped, failed, errors, failures });
    }

    let baseTemplateRow: { name: string; subject: string; body: string } | null = null;
    if (email_template_id) {
      const { data: t } = await supabase
        .from("email_templates")
        .select("name, subject, body")
        .eq("id", email_template_id)
        .single();
      if (t) baseTemplateRow = t as { name: string; subject: string; body: string };
    }

    const useCustom = Boolean(customSubject && customBody);
    if (!baseTemplateRow && !useCustom) {
      return NextResponse.json(
        { error: "请提供 email_template_id 或 subject+body 或 previews" },
        { status: 400 }
      );
    }

    for (const cid of company_ids) {
      const { data: company } = await supabase
        .from("companies")
        .select(
          "*, contacts(*), property_companies(role, properties(id, name, units, city, build_year, address, area))"
        )
        .eq("id", cid)
        .single();

      if (!company) {
        skipped++;
        continue;
      }

      const c = company as CompanyWithContacts & {
        property_companies?: Array<{
          role?: string;
          properties?: {
            id: string;
            name: string;
            units?: number | null;
            city?: string | null;
            build_year?: number | null;
            address?: string | null;
            area?: string | null;
          } | null;
        }>;
      };

      const to = resolveRecipientEmail(c);
      if (!to) {
        skipped++;
        continue;
      }

      const rawList: BatchPropertyForTemplate[] = [];
      for (const pc of c.property_companies ?? []) {
        const pr = pc.properties;
        if (!pr?.id || !pr?.name) continue;
        rawList.push({
          property_id: pr.id,
          property_name: pr.name,
          units: pr.units ?? null,
          city: pr.city ?? null,
          address: pr.address ?? null,
          area: pr.area ?? null,
          build_year: pr.build_year ?? null,
          company_role: pc.role ?? "",
        });
      }

      const list =
        rawList.length > 0
          ? dedupePropertiesByIdPreferHigherUnits(rawList)
          : [];

      const contactName = contactFirstName(resolveContactName(c));

      let vars: Record<string, string>;
      let propertyNameForHeader: string;
      if (list.length === 1) {
        const lone = list[0]!;
        vars = {
          company_name: c.name ?? "",
          company_role: lone.company_role ?? "",
          property_name: lone.property_name,
          contact_name: contactName,
        };
        propertyNameForHeader = lone.property_name;
      } else if (list.length >= 2) {
        const baseVars = buildDeveloperBatchTemplateVars(list, {
          company_name: c.name ?? "",
          company_role: list[0]?.company_role ?? "",
        });
        vars = { ...baseVars, contact_name: contactName };
        propertyNameForHeader = baseVars.property_name || "your portfolio";
      } else {
        vars = {
          company_name: c.name ?? "",
          company_role: "",
          property_name: "your portfolio",
          contact_name: contactName,
        };
        propertyNameForHeader = "your portfolio";
      }

      const propertyId = list[0]?.property_id ?? null;

      let effectiveBaseTemplateRow = baseTemplateRow;
      if (!useCustom && baseTemplateRow && isInvoManagedEmailTemplateName(baseTemplateRow.name)) {
        const targetName = invoBaseTemplateNameFromBuildYears(list.map((r) => r.build_year));
        const { data: swapped } = await supabase
          .from("email_templates")
          .select("name, subject, body")
          .eq("name", targetName)
          .maybeSingle();
        if (swapped) {
          effectiveBaseTemplateRow = swapped as typeof baseTemplateRow;
        }
      }

      let subject: string;
      let emailBody: string;
      if (useCustom) {
        subject = applyTemplate(customSubject!, vars);
        emailBody = applyTemplate(customBody!, vars);
      } else {
        let subjectTpl = effectiveBaseTemplateRow!.subject;
        let bodyTpl = effectiveBaseTemplateRow!.body;
        if (list.length >= 2 && effectiveBaseTemplateRow!.name) {
          const multiName = resolveInvoMultiDeveloperTemplateName(effectiveBaseTemplateRow!.name);
          if (multiName) {
            const { data: multiRow } = await supabase
              .from("email_templates")
              .select("subject, body")
              .eq("name", multiName)
              .maybeSingle();
            if (multiRow) {
              subjectTpl = multiRow.subject;
              bodyTpl = multiRow.body;
            }
          }
        }
        subject = applyTemplate(subjectTpl, vars);
        emailBody = applyTemplate(bodyTpl, vars);
      }

      try {
        const senderName = sig.senderName;
        const outgoing = useHtml
          ? wrapEmailHtml(
              emailBody,
              undefined,
              undefined,
              propertyNameForHeader,
              senderName,
              from,
              sig.signatureTitleLine
            )
          : emailBody;
        const sendResult = await sendEmail(to, subject, outgoing, from, useHtml, {
          senderName,
          attachmentPath: attach,
          cc: ccMerged,
          bcc: bccMerged,
        });
        const ai_summary = await summarizeSentEmail(emailBody);
        await supabase.from("emails").insert({
          company_id: cid,
          property_id: propertyId,
          direction: "sent",
          from_email: from,
          to_email: to,
          subject,
          body: emailBody,
          ai_summary,
          status: "sent",
          gmail_message_id: null,
          resend_id: sendResult?.id ?? null,
        });
        for (const row of list) {
          await updateOutreachAfterEmailSent(supabase, row.property_id);
        }
        success++;
      } catch (e) {
        failed++;
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push(`${c.name}: ${errMsg}`);
        failures.push({ to, error: errMsg });
      }
      await sleep(500);
    }

    return NextResponse.json({ success, skipped, failed, errors, failures });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
