import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";
import { wrapEmailHtml } from "@/lib/email-template";
import { updateOutreachAfterEmailSent } from "@/lib/outreach-after-send";
import { mergeRecipientList } from "@/lib/email-recipients";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      to,
      subject,
      body: emailBody,
      company_id,
      property_id,
      property_ids: bodyPropertyIds,
      property_display_name,
      sender_name,
      is_html = true,
      attachment_path,
      is_test,
      cc: bodyCc,
      bcc: bodyBcc,
    } = body as {
      to: string;
      subject?: string;
      body?: string;
      company_id?: string;
      property_id?: string | null;
      /** 同一开发商多盘合并发信：全部关联楼盘，用于逐盘更新 outreach */
      property_ids?: string[] | null;
      /** HTML 信纸抬头楼盘名（多盘时为合并展示名） */
      property_display_name?: string | null;
      sender_name?: string;
      /** 默认 true：HTML + 品牌模版；false 为纯文本（含系统 ASCII 签名） */
      is_html?: boolean;
      /** 相对 public/ 的文件名，如 invo-deck.pdf；不传或空则不附加 */
      attachment_path?: string | null;
      /** 测试邮件：仅需 to，可不关联 company / outreach */
      is_test?: boolean;
      /** 抄送，逗号/分号分隔；会与 DEFAULT_CC_EMAIL 合并 */
      cc?: string | null;
      bcc?: string | null;
    };

    const resolvedCc = () =>
      mergeRecipientList(
        typeof bodyCc === "string" ? bodyCc : null,
        process.env.DEFAULT_CC_EMAIL
      );
    const resolvedBcc = () =>
      mergeRecipientList(
        typeof bodyBcc === "string" ? bodyBcc : null,
        process.env.DEFAULT_BCC_EMAIL
      );

    if (is_test) {
      if (!to?.trim()) {
        return NextResponse.json({ error: "缺少 to" }, { status: 400 });
      }
      const from = (process.env.SENDER_EMAIL || "").trim();
      if (!from) {
        return NextResponse.json({ error: "未配置 SENDER_EMAIL" }, { status: 503 });
      }
      const testSubject = (subject ?? "INVO Email Test").trim();
      const testBody =
        (emailBody ?? "This is a test email from INVO Ops Hub.").trim();
      const senderName =
        sender_name?.trim() || process.env.SENDER_NAME?.trim() || "Royce Huang";
      const useHtml = Boolean(is_html);
      const outgoingBody = useHtml
        ? wrapEmailHtml(testBody, undefined, undefined, undefined, senderName, from)
        : testBody;
      const attach =
        typeof attachment_path === "string" && attachment_path.trim()
          ? attachment_path.trim()
          : undefined;
      const sendResult = await sendEmail(
        to.trim(),
        testSubject,
        outgoingBody,
        from,
        useHtml,
        {
          senderName,
          attachmentPath: attach,
          cc: resolvedCc(),
          bcc: resolvedBcc(),
        }
      );
      const resendId = sendResult?.id ?? null;
      await supabase.from("emails").insert({
        company_id: null,
        property_id: null,
        direction: "sent",
        from_email: from,
        to_email: to.trim(),
        subject: testSubject,
        body: testBody,
        ai_summary: null,
        status: "sent",
        gmail_message_id: null,
        resend_id: resendId,
      });
      return NextResponse.json({
        success: true,
        test: true,
        resend_id: resendId,
      });
    }

    if (!to?.trim() || !subject?.trim() || !emailBody?.trim() || !company_id) {
      return NextResponse.json(
        { error: "缺少 to / subject / body / company_id" },
        { status: 400 }
      );
    }

    const from = (process.env.SENDER_EMAIL || "").trim();
    if (!from) {
      return NextResponse.json({ error: "未配置 SENDER_EMAIL" }, { status: 503 });
    }

    const aiSummary = emailBody.trim()
      ? await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 64,
          system: "你是 BD 邮件分析助手。只输出最终总结，不要输出其它文字。",
          messages: [
            {
              role: "user",
              content: `用一句中文总结这封邮件的核心内容和需要的行动，不超过30字。邮件内容：${emailBody}`,
            },
          ],
        }).then((r) => {
          const text = r.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
          return (text || "").trim().slice(0, 30);
        })
      : null;

    /** 合并 property_ids 与 property_id，避免只传其一或 JSON 省略 undefined 时漏掉 */
    const outreachPropertyIds: string[] = (() => {
      const fromArr = Array.isArray(bodyPropertyIds)
        ? bodyPropertyIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const fromOne =
        property_id != null && String(property_id).trim()
          ? [String(property_id).trim()]
          : [];
      return Array.from(new Set([...fromArr, ...fromOne]));
    })();

    let propertyName: string | undefined;
    const displayOverride =
      typeof property_display_name === "string" ? property_display_name.trim() : "";
    if (displayOverride) {
      propertyName = displayOverride;
    } else if (outreachPropertyIds.length > 1) {
      const { data: props } = await supabase
        .from("properties")
        .select("id,name")
        .in("id", outreachPropertyIds);
      const order = new Map(outreachPropertyIds.map((id, i) => [id, i]));
      const rows = (props ?? []) as { id: string; name?: string }[];
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      propertyName = rows.map((r) => r.name).filter(Boolean).join(" · ");
    } else if (outreachPropertyIds.length === 1) {
      const { data: prop } = await supabase
        .from("properties")
        .select("name")
        .eq("id", outreachPropertyIds[0]!)
        .maybeSingle();
      propertyName = (prop as { name?: string } | null)?.name;
    }

    const senderName =
      sender_name?.trim() || process.env.SENDER_NAME?.trim() || "Royce Huang";

    const useHtml = Boolean(is_html);
    const outgoingBody = useHtml
      ? wrapEmailHtml(
          emailBody,
          undefined,
          undefined,
          propertyName,
          senderName,
          from
        )
      : emailBody.trim();

    const attach =
      typeof attachment_path === "string" && attachment_path.trim()
        ? attachment_path.trim()
        : undefined;

    const sendResult = await sendEmail(
      to.trim(),
      subject.trim(),
      outgoingBody,
      from,
      useHtml,
      {
        senderName: senderName,
        attachmentPath: attach,
        cc: resolvedCc(),
        bcc: resolvedBcc(),
      }
    );
    const resendId = sendResult?.id ?? null;

    for (const pid of outreachPropertyIds) {
      await updateOutreachAfterEmailSent(supabase, pid);
    }

    const { data: row, error: insErr } = await supabase
      .from("emails")
      .insert({
        company_id,
        property_id: outreachPropertyIds[0] ?? property_id ?? null,
        direction: "sent",
        from_email: from,
        to_email: to.trim(),
        subject: subject.trim(),
        body: emailBody,
        ai_summary: aiSummary,
        status: "sent",
        gmail_message_id: null,
        resend_id: resendId,
      })
      .select()
      .single();

    if (insErr) {
      return NextResponse.json(
        { error: insErr.message, sent: true, resend_id: resendId },
        { status: 201 }
      );
    }

    return NextResponse.json({ success: true, email: row, resend_id: resendId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
