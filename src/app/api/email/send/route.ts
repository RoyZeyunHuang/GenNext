import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/gmail";
import { wrapEmailHtml } from "@/lib/email-template";

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
      sender_name,
    } = body as {
      to: string;
      subject: string;
      body: string;
      company_id: string;
      property_id?: string | null;
      sender_name?: string;
    };

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

    let propertyName: string | undefined;
    if (property_id) {
      const { data: prop } = await supabase
        .from("properties")
        .select("name")
        .eq("id", property_id)
        .maybeSingle();
      propertyName = (prop as { name?: string } | null)?.name;
    }

    const senderName =
      sender_name?.trim() || process.env.SENDER_NAME?.trim() || "Royce Huang";
    const htmlBody = wrapEmailHtml(
      emailBody,
      undefined,
      undefined,
      propertyName,
      senderName,
      from
    );

    const sendResult = await sendEmail(
      to.trim(),
      subject.trim(),
      htmlBody,
      from,
      true
    );
    const gmailMessageId = sendResult?.id ?? null;

    const { data: row, error: insErr } = await supabase
      .from("emails")
      .insert({
        company_id,
        property_id: property_id || null,
        direction: "sent",
        from_email: from,
        to_email: to.trim(),
        subject: subject.trim(),
        body: emailBody,
        ai_summary: aiSummary,
        status: "sent",
        gmail_message_id: gmailMessageId,
        // resend_id 字段保留但不再使用
        resend_id: null,
      })
      .select()
      .single();

    if (insErr) {
      return NextResponse.json(
        { error: insErr.message, sent: true, gmail_message_id: gmailMessageId },
        { status: 201 }
      );
    }

    if (property_id) {
      await supabase
        .from("outreach")
        .update({
          last_email_at: new Date().toISOString(),
          needs_attention: false,
        })
        .eq("property_id", property_id);
    }

    return NextResponse.json({ success: true, email: row, gmail_message_id: gmailMessageId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
