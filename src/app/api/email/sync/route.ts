import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { searchEmails } from "@/lib/gmail";
import {
  resolveRecipientEmail,
  type CompanyWithContacts,
} from "@/lib/email-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

async function summarizeEmail(body: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 96,
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
  return (text || "").trim().slice(0, 30);
}

async function summarizeBdProgress(aiSummaries: string[]): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 96,
    system: "你是 BD 进展总结助手。只输出一句中文，不要输出其它文字。",
    messages: [
      {
        role: "user",
        content: `根据以下邮件往来记录，用一句中文总结当前 BD 进展，不超过 40 字。\n邮件记录：${aiSummaries
          .filter(Boolean)
          .slice(-5)
          .join("；")}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return (text || "").trim().slice(0, 40);
}

async function getPropertyIdsForCompany(companyId: string): Promise<string[]> {
  const { data } = await supabase
    .from("property_companies")
    .select("property_id")
    .eq("company_id", companyId);
  return (data ?? [])
    .map((r) => (r as { property_id: string | null }).property_id)
    .filter(Boolean) as string[];
}

export async function POST() {
  try {
    if (!anthropic.apiKey) {
      return NextResponse.json(
        { error: "未配置 ANTHROPIC_API_KEY / CLAUDE_API_KEY" },
        { status: 503 }
      );
    }

    const { data: companies } = await supabase
      .from("companies")
      .select("*, contacts(*)");

    const list = (companies ?? []) as CompanyWithContacts[];

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const c of list) {
      const addr = resolveRecipientEmail(c);
      if (!addr) {
        skipped++;
        continue;
      }

      const propertyIds = await getPropertyIdsForCompany(c.id);
      const propertyIdForInsert = propertyIds[0] ?? null;

      const q = `in:inbox (from:${addr} OR to:${addr})`;
      let messages: Array<{
        gmail_message_id: string;
        from: string;
        to: string;
        subject: string;
        date: string;
        body: string;
        snippet: string;
      }> = [];

      try {
        messages = (await searchEmails(q, 5)) as any[];
      } catch (e) {
        errors.push(
          `${c.name}: Gmail search 失败: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
        continue;
      }

      for (const msg of messages) {
        try {
          const { data: existing } = await supabase
            .from("emails")
            .select("id")
            .eq("gmail_message_id", msg.gmail_message_id)
            .maybeSingle();

          if (existing) {
            skipped++;
            continue;
          }
          const mailBody = (msg.body || msg.snippet || "").trim();
          const aiSummary = mailBody ? await summarizeEmail(mailBody) : null;

          await supabase.from("emails").insert({
            company_id: c.id,
            property_id: propertyIdForInsert,
            direction: "received",
            from_email: msg.from || addr,
            to_email: msg.to || "",
            subject: msg.subject || "(no subject)",
            body: mailBody,
            ai_summary: aiSummary,
            status: null,
            gmail_message_id: msg.gmail_message_id,
          });

          synced++;
          await new Promise((r) => setTimeout(r, 250));
        } catch (e) {
          errors.push(
            `${c.name}: 插入邮件失败: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
        }
      }

      if (!propertyIds.length) continue;

      const { data: latestRows } = await supabase
        .from("emails")
        .select("direction, created_at, id")
        .eq("company_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const latest = latestRows?.[0] as
        | { direction: string; created_at: string; id: string }
        | undefined;

      let needsAttention = false;
      let lastEmailAt: string | null = null;

      if (latest) {
        lastEmailAt = latest.created_at;
        const { data: hasSentRows } = await supabase
          .from("emails")
          .select("id")
          .eq("company_id", c.id)
          .eq("direction", "sent")
          .gt("created_at", latest.created_at)
          .limit(1);

        needsAttention =
          latest.direction === "received" &&
          !((hasSentRows ?? []).length > 0);
      }

      const { data: recentRows } = await supabase
        .from("emails")
        .select("ai_summary")
        .eq("company_id", c.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const summaries = (recentRows ?? [])
        .map((r) => (r as { ai_summary: string | null }).ai_summary)
        .filter(Boolean) as string[];

      const bdSummary = summaries.length
        ? await summarizeBdProgress(summaries)
        : null;

      const updatePayload: Record<string, unknown> = {
        needs_attention: needsAttention,
        last_email_at: lastEmailAt,
        ...(bdSummary ? { ai_summary: bdSummary } : {}),
      };

      await supabase.from("outreach").update(updatePayload).in("property_id", propertyIds);
    }

    // Detect bounced emails and mark latest sent rows
    const extractOriginalRecipientEmail = (body: string) => {
      const text = body || "";
      // Common patterns in DSN payloads
      const m1 =
        text.match(/Original-Recipient:\s*[^;]*;\s*<?([^>\s]+@[^>\s]+)>?/i) ??
        text.match(/Final-Recipient:\s*[^;]*;\s*<?([^>\s]+@[^>\s]+)>?/i);
      if (m1?.[1]) return m1[1];

      // Fallback: pick the first email-like token that's not mailer-daemon
      const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
      const mailer = "mailer-daemon@googlemail.com";
      const sender = (process.env.SENDER_EMAIL || "").trim().toLowerCase();
      const candidate = found.find((e) => {
        const x = e.toLowerCase();
        return x !== mailer && (!sender || x !== sender);
      });
      return candidate ?? null;
    };

    try {
      const bounces = (await searchEmails(
        'from:mailer-daemon@googlemail.com subject:"Delivery Status Notification"',
        20
      )) as any[];

      for (const b of bounces) {
        const recipient = extractOriginalRecipientEmail(
          String(b.body ?? b.snippet ?? "")
        );
        if (!recipient) continue;

        const { data: sentRows } = await supabase
          .from("emails")
          .select("id, property_id")
          .eq("to_email", recipient)
          .eq("direction", "sent")
          .eq("status", "sent")
          .order("created_at", { ascending: false })
          .limit(1);

        const sent = sentRows?.[0] as { id: string; property_id: string | null } | undefined;
        if (!sent?.id) continue;

        await supabase.from("emails").update({
          status: "bounced",
          bounced_at: new Date().toISOString(),
        }).eq("id", sent.id);

        if (sent.property_id) {
          await supabase.from("outreach").update({
            needs_attention: true,
            last_email_at: new Date().toISOString(),
          }).eq("property_id", sent.property_id);
        }
      }
    } catch {
      // ignore bounce failures; received sync still succeeds
    }

    return NextResponse.json({ synced, skipped, errors });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
