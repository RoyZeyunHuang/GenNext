import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend Webhooks：送达 / 打开 / 点击 / 弹回 → 更新 `emails` 与必要时的 `outreach`。
 * 在 Resend Dashboard 配置 URL：`https://你的域名/api/webhook/resend`
 */
export async function POST(req: NextRequest) {
  try {
    const event = (await req.json()) as {
      type?: string;
      data?: { email_id?: string };
    };

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
