import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPersonaGenerateWeeklyLimit, utcWeekStartDateString } from "@/lib/persona-generate-quota";
import { requireRfAdmin } from "@/lib/require-rf-admin";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTokenSecret(): string {
  return process.env.RF_APPROVE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "quota-approve-fallback";
}

function verifyQuotaToken(requestId: string, token: string): boolean {
  const expected = createHmac("sha256", getTokenSecret()).update(`quota:${requestId}`).digest("hex");
  return expected === token;
}

function renderHtml(title: string, message: string, success: boolean) {
  const color = success ? "#16a34a" : "#dc2626";
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#FAFAF9;">
      <div style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;">${success ? "✅" : "❌"}</div>
        <h1 style="color:${color};font-size:20px;margin-bottom:8px;">${title}</h1>
        <p style="color:#78716C;font-size:14px;">${message}</p>
      </div>
    </body></html>`,
    { status: success ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * GET /api/admin/grant-quota?request_id=...&token=...
 * One-click approval from admin email — grants +15 for this week
 */
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("request_id");
  const token = req.nextUrl.searchParams.get("token");

  if (!requestId || !token) {
    return renderHtml("参数缺失", "缺少 request_id 或 token", false);
  }

  if (!verifyQuotaToken(requestId, token)) {
    return renderHtml("Token 无效", "签名验证失败，请通过 Admin 面板操作", false);
  }

  const supabase = getSupabaseAdmin();

  // Load request
  const { data: request, error: reqErr } = await supabase
    .from("quota_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (reqErr || !request) {
    return renderHtml("申请不存在", "找不到对应的申请记录", false);
  }

  if (request.status === "approved") {
    return renderHtml("已批准", `该申请已于 ${new Date(request.granted_at).toLocaleString("zh-CN")} 批准过`, true);
  }

  // Grant +15: reduce the weekly usage count by 15 (or set to 0 if < 15)
  const bonus = getPersonaGenerateWeeklyLimit(); // 15
  const userId = request.user_id as string;
  const weekStart = utcWeekStartDateString();

  // Get current usage
  const { data: usageRow } = await supabase
    .from("persona_generate_daily_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("usage_date", weekStart)
    .maybeSingle();

  const currentCount = (usageRow?.count as number) ?? 0;
  const newCount = Math.max(0, currentCount - bonus);

  // Upsert the reduced count
  await supabase
    .from("persona_generate_daily_usage")
    .upsert(
      { user_id: userId, usage_date: weekStart, count: newCount },
      { onConflict: "user_id,usage_date" }
    );

  // Mark request as approved
  await supabase
    .from("quota_requests")
    .update({ status: "approved", granted_at: new Date().toISOString() })
    .eq("id", requestId);

  // Notify user via email
  try {
    const userEmail = request.email as string;
    if (userEmail) {
      await sendEmail(
        userEmail,
        "你的黑魔法额外用量已批准 ✨",
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#1C1917;">额外用量已到账！</h2>
          <p style="color:#44403C;font-size:14px;line-height:1.6;">
            管理员已批准你的申请，本周额外 ${bonus} 次黑魔法生成已到账。
          </p>
          <p style="color:#78716C;font-size:13px;margin-top:16px;">— Rednote Factory</p>
        </div>`,
        undefined,
        true
      );
    }
  } catch {
    // Don't fail on email send error
  }

  return renderHtml("批准成功", `已为 ${request.email} 增加 ${bonus} 次本周额度（用量 ${currentCount} → ${newCount}）`, true);
}

/**
 * POST /api/admin/grant-quota
 * Admin panel grant — requires admin session
 * Body: { user_id: string }
 */
export async function POST(req: NextRequest) {
  const gate = await requireRfAdmin();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";

  if (!userId) {
    return NextResponse.json({ error: "user_id 必填" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const bonus = getPersonaGenerateWeeklyLimit(); // 15
  const weekStart = utcWeekStartDateString();

  // Get current usage
  const { data: usageRow } = await supabase
    .from("persona_generate_daily_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("usage_date", weekStart)
    .maybeSingle();

  const currentCount = (usageRow?.count as number) ?? 0;
  const newCount = Math.max(0, currentCount - bonus);

  // Upsert
  const { error: upsertErr } = await supabase
    .from("persona_generate_daily_usage")
    .upsert(
      { user_id: userId, usage_date: weekStart, count: newCount },
      { onConflict: "user_id,usage_date" }
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Mark any pending requests from this user as approved
  await supabase
    .from("quota_requests")
    .update({ status: "approved", granted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending");

  // Load user email for notification
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const userEmail = userData?.user?.email;

  if (userEmail) {
    try {
      await sendEmail(
        userEmail,
        "你的黑魔法额外用量已批准 ✨",
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#1C1917;">额外用量已到账！</h2>
          <p style="color:#44403C;font-size:14px;line-height:1.6;">
            管理员已批准你的申请，本周额外 ${bonus} 次黑魔法生成已到账。
          </p>
          <p style="color:#78716C;font-size:13px;margin-top:16px;">— Rednote Factory</p>
        </div>`,
        undefined,
        true
      );
    } catch {
      // Don't fail on email error
    }
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    email: userEmail ?? null,
    previous_count: currentCount,
    new_count: newCount,
    bonus,
  });
}
