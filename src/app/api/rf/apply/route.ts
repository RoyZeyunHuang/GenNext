import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isNystudentsNetEmail } from "@/lib/nystudents-email";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "zyhuang@nystudents.net";

/** HMAC secret for approval tokens — falls back to service role key */
function getTokenSecret(): string {
  return process.env.RF_APPROVE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "rf-approve-fallback";
}

/** Generate a signed approval token: HMAC(userId) */
export function generateApproveToken(userId: string): string {
  return createHmac("sha256", getTokenSecret()).update(userId).digest("hex");
}

/**
 * POST /api/rf/apply
 * Body: { email, password, display_name, group_name }
 *
 * 1. Creates Supabase auth user with rf_approved:false
 * 2. Inserts rf_applications row
 * 3. Sends notification email to admin
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password, display_name, group_name } = body as {
    email?: string;
    password?: string;
    display_name?: string;
    group_name?: string;
  };

  // ── Validation ──
  const trimmedEmail = (email ?? "").trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return NextResponse.json({ error: "请填写有效的邮箱地址" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 个字符" }, { status: 400 });
  }
  if (!display_name?.trim()) {
    return NextResponse.json({ error: "请填写称呼" }, { status: 400 });
  }
  if (!group_name?.trim()) {
    return NextResponse.json({ error: "请填写所在组名" }, { status: 400 });
  }

  // nystudents.net users should use normal signup, not apply
  if (isNystudentsNetEmail(trimmedEmail)) {
    return NextResponse.json(
      { error: "@nystudents.net 邮箱无需申请，直接注册即可" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // ── Check if email already registered ──
  const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const alreadyExists = existingUsers?.users?.some(
    (u) => u.email?.toLowerCase() === trimmedEmail
  );
  if (alreadyExists) {
    return NextResponse.json(
      { error: "该邮箱已注册。如已申请，请等待审核；如已通过，请直接登录。" },
      { status: 409 }
    );
  }

  // ── Create Supabase auth user (rf_approved = false) ──
  const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true, // Skip email verification for apply flow
    app_metadata: {
      rf_approved: false,
      display_name: display_name.trim(),
      group_name: group_name.trim(),
    },
  });

  if (createErr) {
    console.error("[apply] createUser error:", createErr);
    const msg = createErr.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) {
      return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    }
    return NextResponse.json({ error: "创建账户失败，请稍后再试" }, { status: 500 });
  }

  const userId = newUser.user.id;

  // ── Insert application record ──
  await supabase.from("rf_applications").insert({
    user_id: userId,
    email: trimmedEmail,
    display_name: display_name.trim(),
    group_name: group_name.trim(),
    status: "pending",
  });

  // ── Send admin notification email ──
  try {
    const token = generateApproveToken(userId);
    const origin = req.nextUrl.origin;
    const approveUrl = `${origin}/api/rf/approve?user_id=${userId}&token=${token}`;

    const subject = `[RF 新申请] ${display_name.trim()} — ${group_name.trim()}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1C1917; margin-bottom: 20px;">Rednote Factory 新用户申请</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 12px; color: #78716C; font-size: 13px; border-bottom: 1px solid #E7E5E4;">邮箱</td>
            <td style="padding: 8px 12px; color: #1C1917; font-size: 14px; font-weight: 500; border-bottom: 1px solid #E7E5E4;">${trimmedEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #78716C; font-size: 13px; border-bottom: 1px solid #E7E5E4;">称呼</td>
            <td style="padding: 8px 12px; color: #1C1917; font-size: 14px; font-weight: 500; border-bottom: 1px solid #E7E5E4;">${display_name.trim()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #78716C; font-size: 13px; border-bottom: 1px solid #E7E5E4;">所在组</td>
            <td style="padding: 8px 12px; color: #1C1917; font-size: 14px; font-weight: 500; border-bottom: 1px solid #E7E5E4;">${group_name.trim()}</td>
          </tr>
        </table>
        <a href="${approveUrl}"
           style="display: inline-block; padding: 12px 32px; background: #1C1917; color: #fff; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 600;">
          批准此申请
        </a>
        <p style="margin-top: 20px; font-size: 12px; color: #A8A29E;">
          或在 Admin 面板中管理: ${origin}/rednote-factory/copywriter-rag
        </p>
      </div>
    `;

    await sendEmail(ADMIN_EMAIL, subject, html, undefined, true);
  } catch (emailErr) {
    // Don't fail the application if email fails — admin can check admin panel
    console.error("[apply] Failed to send admin notification:", emailErr);
  }

  return NextResponse.json({ ok: true, message: "申请已提交" });
}
