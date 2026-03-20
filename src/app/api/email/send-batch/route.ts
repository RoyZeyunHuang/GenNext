import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  applyTemplate,
  resolveContactName,
  resolveRecipientEmail,
  sleep,
  type CompanyWithContacts,
} from "@/lib/email-helpers";
import { sendEmail } from "@/lib/gmail";
import { wrapEmailHtml } from "@/lib/email-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

async function summarizeSentEmail(body: string): Promise<string | null> {
  if (!body.trim()) return null;
  if (!anthropic.apiKey) return null;

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
    } = body as {
      company_ids: string[];
      email_template_id?: string | null;
      subject?: string;
      body?: string;
      previews?: Array<{
        company_id: string;
        to: string;
        subject: string;
        body: string;
        property_id?: string | null;
        property_name?: string | null;
        sender_name?: string;
      }>;
    };

    if (!Array.isArray(company_ids) || company_ids.length === 0) {
      return NextResponse.json({ error: "company_ids 不能为空" }, { status: 400 });
    }

    const from = (process.env.SENDER_EMAIL || "").trim();
    if (!from) {
      return NextResponse.json({ error: "未配置 SENDER_EMAIL" }, { status: 503 });
    }
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
          const senderName =
            p.sender_name?.trim() ||
            process.env.SENDER_NAME?.trim() ||
            "Royce Huang";
          const htmlBody = wrapEmailHtml(
            p.body,
            undefined,
            undefined,
            p.property_name ?? undefined,
            senderName,
            from
          );
          const sendResult = await sendEmail(to, p.subject, htmlBody, from, true);
          const ai_summary = await summarizeSentEmail(p.body);
          await supabase.from("emails").insert({
            company_id: p.company_id,
            property_id: p.property_id || null,
            direction: "sent",
            from_email: from,
            to_email: to,
            subject: p.subject,
            body: p.body,
            ai_summary,
            status: "sent",
            gmail_message_id: (sendResult as any)?.id ?? null,
            resend_id: null,
          });
          if (p.property_id) {
            await supabase
              .from("outreach")
              .update({
                last_email_at: new Date().toISOString(),
                needs_attention: false,
              })
              .eq("property_id", p.property_id);
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

    let template: { subject: string; body: string } | null = null;
    if (email_template_id) {
      const { data: t } = await supabase
        .from("email_templates")
        .select("subject, body")
        .eq("id", email_template_id)
        .single();
      if (t) template = t;
    }

    const useCustom = Boolean(customSubject && customBody);
    if (!template && !useCustom) {
      return NextResponse.json(
        { error: "请提供 email_template_id 或 subject+body 或 previews" },
        { status: 400 }
      );
    }

    for (const cid of company_ids) {
      const { data: company } = await supabase
        .from("companies")
        .select("*, contacts(*), property_companies(*, properties(id, name))")
        .eq("id", cid)
        .single();

      if (!company) {
        skipped++;
        continue;
      }

      const c = company as CompanyWithContacts & {
        property_companies?: Array<{
          properties?: { id: string; name: string } | null;
        }>;
      };

      const to = resolveRecipientEmail(c);
      if (!to) {
        skipped++;
        continue;
      }

      const prop =
        c.property_companies?.find((pc) => pc.properties)?.properties ?? null;
      const propertyName = prop?.name ?? "your portfolio";
      const propertyId = prop?.id ?? null;
      const vars = {
        company_name: c.name,
        contact_name: resolveContactName(c),
        property_name: propertyName,
      };

      const subject = useCustom
        ? applyTemplate(customSubject!, vars)
        : applyTemplate(template!.subject, vars);
      const emailBody = useCustom
        ? applyTemplate(customBody!, vars)
        : applyTemplate(template!.body, vars);

      try {
        const senderName = process.env.SENDER_NAME?.trim() || "Royce Huang";
        const htmlBody = wrapEmailHtml(
          emailBody,
          undefined,
          undefined,
          propertyName,
          senderName,
          from
        );
        const sendResult = await sendEmail(to, subject, htmlBody, from, true);
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
          gmail_message_id: (sendResult as any)?.id ?? null,
          resend_id: null,
        });
        if (propertyId) {
          await supabase
            .from("outreach")
            .update({
              last_email_at: new Date().toISOString(),
              needs_attention: false,
            })
            .eq("property_id", propertyId);
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
