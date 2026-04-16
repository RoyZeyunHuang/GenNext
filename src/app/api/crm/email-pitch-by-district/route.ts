import { NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";
import { getDistrictPitchReport } from "@/lib/resend-district-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/crm/email-pitch-by-district
 * 返回按「区 / 小区」分组的 email pitch 发送 + 送达报表。
 * 数据链路复用 getResendPropertyReport 的同源底层（Resend API + emails 表）。
 */
export async function GET() {
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const report = await getDistrictPitchReport();
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
