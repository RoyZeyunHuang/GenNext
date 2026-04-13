import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Must match the secret used in /api/rf/apply */
function getTokenSecret(): string {
  return process.env.RF_APPROVE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "rf-approve-fallback";
}

function verifyToken(userId: string, token: string): boolean {
  const expected = createHmac("sha256", getTokenSecret()).update(userId).digest("hex");
  return token === expected;
}

/**
 * GET /api/rf/approve?user_id=xxx&token=xxx
 * One-click approval from admin email link.
 * Returns an HTML page confirming the action.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const token = req.nextUrl.searchParams.get("token");

  if (!userId || !token) {
    return new NextResponse(renderHtml("参数缺失", "缺少 user_id 或 token", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!verifyToken(userId, token)) {
    return new NextResponse(renderHtml("验证失败", "Token 无效或已过期", false), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const { data: userData, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr || !userData?.user) {
    return new NextResponse(renderHtml("用户不存在", "找不到该用户", false), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const user = userData.user;
  const displayName = user.app_metadata?.display_name || user.email || "用户";

  // Already approved?
  if (user.app_metadata?.rf_approved === true) {
    return new NextResponse(
      renderHtml("已通过", `${displayName} (${user.email}) 的申请之前已批准`, true),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Approve: set rf_approved = true in app_metadata
  const prevMeta = user.app_metadata ?? {};
  const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...prevMeta, rf_approved: true },
  });

  if (updateErr) {
    return new NextResponse(
      renderHtml("审批失败", updateErr.message, false),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Update application record
  await supabase
    .from("rf_applications")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("user_id", userId);

  // Notify the user via email
  try {
    if (user.email) {
      const origin = req.nextUrl.origin;
      const loginUrl = `${origin}/rednote-factory/login`;
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1C1917;">申请已通过!</h2>
          <p style="color: #44403C; font-size: 14px; line-height: 1.6;">
            Hi ${displayName}，你的 Rednote Factory 使用申请已通过审核。
            <br/>现在可以登录使用了。
          </p>
          <a href="${loginUrl}"
             style="display: inline-block; margin-top: 16px; padding: 12px 32px; background: #1C1917; color: #fff; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 600;">
            立即登录
          </a>
        </div>
      `;
      await sendEmail(user.email, "Rednote Factory 申请已通过", html, undefined, true);
    }
  } catch {
    // Non-critical — user can still log in
  }

  return new NextResponse(
    renderHtml("审批成功", `已批准 ${displayName} (${user.email}) 的申请，通知邮件已发送`, true),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function renderHtml(title: string, message: string, success: boolean): string {
  const color = success ? "#16a34a" : "#dc2626";
  const icon = success ? "&#10003;" : "&#10007;";
  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — RF</title></head>
<body style="margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:400px;width:100%;margin:0 20px;padding:32px;background:#fff;border-radius:16px;border:1px solid #E7E5E4;box-shadow:0 2px 12px -4px rgba(28,25,23,0.08);text-align:center;">
    <div style="width:48px;height:48px;border-radius:50%;background:${color}15;color:${color};font-size:24px;line-height:48px;margin:0 auto 16px;">${icon}</div>
    <h1 style="margin:0 0 8px;font-size:20px;color:#1C1917;">${title}</h1>
    <p style="margin:0;font-size:14px;color:#78716C;line-height:1.6;">${message}</p>
  </div>
</body>
</html>`;
}
