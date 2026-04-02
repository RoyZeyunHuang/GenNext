import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    let event: { type?: string; data?: { email_id?: string } };

    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (secret) {
      try {
        event = resend.webhooks.verify(({
          payload: body,
          headers: {
            id: req.headers.get("svix-id") ?? "",
            timestamp: req.headers.get("svix-timestamp") ?? "",
            signature: req.headers.get("svix-signature") ?? "",
          },
          webhookSecret: secret,
        }) as never) as typeof event;
      } catch {
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
      }
    } else {
      event = JSON.parse(body);
    }

    const resendId = event.data?.email_id;
    if (!resendId || typeof resendId !== "string") {
      return NextResponse.json({ ok: true });
    }

    const type = event.type ?? "";

    switch (type) {
      case "email.delivered":
        await supabase
          .from("emails")
          .update({ status: "delivered" })
          .eq("resend_id", resendId)
          .eq("status", "sent");
        break;

      case "email.opened":
        await supabase
          .from("emails")
          .update({
            status: "opened",
            opened_at: new Date().toISOString(),
          })
          .eq("resend_id", resendId);
        break;

      case "email.clicked":
        await supabase
          .from("emails")
          .update({
            status: "opened",
            opened_at: new Date().toISOString(),
          })
          .eq("resend_id", resendId);
        break;

      case "email.bounced": {
        const { data: row } = await supabase
          .from("emails")
          .update({
            status: "bounced",
            bounced_at: new Date().toISOString(),
          })
          .eq("resend_id", resendId)
          .select("property_id")
          .maybeSingle();

        const pid = (row as { property_id?: string | null } | null)?.property_id;
        if (pid) {
          await supabase
            .from("outreach")
            .update({ needs_attention: true })
            .eq("property_id", pid);
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
