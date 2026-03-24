import { NextResponse } from "next/server";
import {
  getResendPropertyReport,
  syncResendReportToOutreach,
} from "@/lib/resend-property-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET：拉取 Resend 全部已发列表，与库内 `emails`（direction=sent 且有 resend_id）关联，
 * 按 property_id 汇总每盘是否有 bounce / 是否已有 delivered（或同等成功态）。
 */
export async function GET() {
  try {
    const report = await getResendPropertyReport();
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST：将当前报表中的楼盘同步到 outreach（Email Pitched；有 bounce 则 deal_status=bounced）。
 */
export async function POST() {
  try {
    const report = await getResendPropertyReport();
    const result = await syncResendReportToOutreach(report);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
