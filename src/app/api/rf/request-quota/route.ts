import { NextRequest, NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/resend";
import { getPersonaGenerateWeeklyLimit, getPersonaGenerateUsageThisWeek } from "@/lib/persona-generate-quota";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "royhuang0103@gmail.com";

function getTokenSecret(): string {
  return process.env.RF_APPROVE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "quota-approve-fallback";
}

function generateQuotaToken(requestId: string): string {
  return createHmac("sha256", getTokenSecret()).update(`quota:${requestId}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const session = await getRfSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const supabase = getSupabaseAdmin();

  // Check if there's already a pending request today
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("quota_requests")
    .select("id")
    .eq("user_id", session.userId)
    .eq("status", "pending")
    .gte("created_at", `${today}T00:00:00Z`)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "已有待审核的申请，请等待管理员处理" }, { status: 429 });
  }

  // Insert request
  const { data: inserted, error: insertErr } = await supabase
    .from("quota_requests")
    .insert({
      user_id: session.userId,
      email: session.email ?? "",
      reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[request-quota] insert error:", insertErr);
    return NextResponse.json({ error: "提交失败" }, { status: 500 });
  }

  // Get current usage info
  const limit = getPersonaGenerateWeeklyLimit();
  const used = await getPersonaGenerateUsageThisWeek(session.userId);

  // Send email to admin
  try {
    const requestId = inserted.id as string;
    const token = generateQuotaToken(requestId);
    const origin = req.nextUrl.origin;
    const approveUrl = `${origin}/api/admin/grant-quota?request_id=${requestId}&token=${token}`;

    const subject = `[RF 额度申请] ${session.email} — 请求 +15 次`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1C1917; margin-bottom: 20px;">黑魔法额外用量申请</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 12px; color: #78716C; font-size: 13px; border-bottom: 1px solid #E7E5E4;">用户</td>
            <td style="padding: 8px 12px; color: #1C1917; font-size: 14px; font-weight: 500; border-bottom: 1px solid #E7E5E4;">${session.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #78716C; font-size: 13px; border-bottom: 1px solid #E7E5E4;">本周用量</td>
            <td style="padding: 8px 12px; color: #1C1917; font-size: 14px; font-weight: 500; border-bottom: 1px solid #E7E5E4;">${used} / ${limit}</td>
          </tr>
          ${reason ? `<tr>
            <td style="padding: 8px 12px; color: #78716C; font-size: 13px; border-bottom: 1px solid #E7E5E4;">理由</td>
            <td style="padding: 8px 12px; color: #1C1917; font-size: 14px; font-weight: 500; border-bottom: 1px solid #E7E5E4;">${reason}</td>
          </tr>` : ""}
        </table>
        <a href="${approveUrl}"
           style="display: inline-block; padding: 12px 32px; background: #1C1917; color: #fff; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 600;">
          批准 +15 次
        </a>
        <p style="margin-top: 20px; font-size: 12px; color: #A8A29E;">
          批准后该用户本周额度将增加 15 次。
        </p>
      </div>
    `;

    await sendEmail(ADMIN_EMAIL, subject, html, undefined, true);
  } catch (emailErr) {
    console.error("[request-quota] email error:", emailErr);
  }

  return NextResponse.json({ ok: true, message: "申请已提交，管理员会尽快处理" });
}
