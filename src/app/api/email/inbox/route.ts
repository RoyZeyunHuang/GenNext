import { NextRequest, NextResponse } from "next/server";
import { getGmailClient } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headerMap(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) m[h.name.toLowerCase()] = h.value;
  }
  return m;
}

export async function GET(req: NextRequest) {
  try {
    const companyEmail = req.nextUrl.searchParams.get("company_email") ?? "";
    const gmail = await getGmailClient();

    const q = companyEmail.trim()
      ? `in:inbox from:${companyEmail.trim()}`
      : "in:inbox";

    const list = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: 10,
    });

    const ids = list.data.messages?.map((m) => m.id).filter(Boolean) ?? [];
    const items: Array<{
      from: string;
      subject: string;
      snippet: string;
      date: string;
      gmail_message_id: string;
    }> = [];

    for (const id of ids) {
      if (!id) continue;
      const msg = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = headerMap(msg.data.payload?.headers ?? undefined);
      items.push({
        from: headers["from"] ?? "",
        subject: headers["subject"] ?? "",
        snippet: msg.data.snippet ?? "",
        date: headers["date"] ?? "",
        gmail_message_id: id,
      });
    }

    return NextResponse.json({ messages: items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), messages: [] },
      { status: 500 }
    );
  }
}
