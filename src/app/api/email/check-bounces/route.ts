import { NextResponse } from "next/server";
import { searchEmails } from "@/lib/gmail";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDaemonAddress(addr: string): boolean {
  const lower = addr.toLowerCase();
  const local = lower.split("@")[0] ?? "";
  if (/^(mailer-daemon|postmaster|noreply|no-reply|daemon|mail-daemon)/i.test(local)) return true;
  if (lower.includes("mailer-daemon")) return true;
  return false;
}

/** 从 bounce 正文中取第一个疑似真实收件人邮箱 */
function extractBouncedRecipient(body: string, snippet: string): string | null {
  const text = `${body}\n${snippet}`;
  const re = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
  for (const m of Array.from(text.matchAll(re))) {
    const addr = m[1];
    if (!addr || isDaemonAddress(addr)) continue;
    return addr.trim();
  }
  return null;
}

export async function POST() {
  const query =
    'from:mailer-daemon OR from:postmaster subject:"Delivery Status" OR subject:"Undeliverable" OR subject:"Mail delivery failed"';
  const rows = await searchEmails(query, 50);
  let bounceEmails = rows.length;
  let marked = 0;

  for (const row of rows) {
    if (!row) continue;
    const recipient = extractBouncedRecipient(row.body ?? "", row.snippet ?? "");
    if (!recipient) continue;

    const { data: emailRow } = await supabase
      .from("emails")
      .select("id, property_id, status")
      .eq("to_email", recipient)
      .neq("status", "bounced")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!emailRow) continue;

    const { error: upErr } = await supabase
      .from("emails")
      .update({
        status: "bounced",
        bounced_at: new Date().toISOString(),
      })
      .eq("id", (emailRow as { id: string }).id);

    if (upErr) continue;
    marked++;

    const propertyId = (emailRow as { property_id?: string | null }).property_id;
    if (!propertyId) continue;

    const { data: outreach } = await supabase
      .from("outreach")
      .select("id, notes")
      .eq("property_id", propertyId)
      .maybeSingle();

    if (!outreach) continue;

    const line = `⚠️ Email bounced: ${recipient}`;
    const prev = (outreach as { notes?: string | null }).notes ?? "";
    const newNotes =
      prev && !prev.includes(line)
        ? `${prev}\n---\n${line}`
        : prev.includes(line)
          ? prev
          : line;

    await supabase
      .from("outreach")
      .update({
        needs_attention: true,
        notes: newNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (outreach as { id: string }).id);
  }

  return NextResponse.json({
    ok: true,
    bounce_emails_checked: bounceEmails,
    records_marked: marked,
    message: `检测到 ${bounceEmails} 封 bounce 相关邮件，标记了 ${marked} 条记录`,
  });
}
