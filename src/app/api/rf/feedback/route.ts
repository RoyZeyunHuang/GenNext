import { NextRequest, NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rf/feedback — list current user's feedback submissions
 */
export async function GET() {
  const session = await getRfSession();
  if (!session?.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rf_feedback")
    .select("id, content, rating, page, metadata, created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

/**
 * POST /api/rf/feedback — submit new feedback
 * Body: { content: string (≥15 chars), rating?: number, page?: string, metadata?: object }
 */
export async function POST(req: NextRequest) {
  const session = await getRfSession();
  if (!session?.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { content, rating, page, metadata } = body as {
    content?: string;
    rating?: number;
    page?: string;
    metadata?: Record<string, unknown>;
  };

  if (!content || typeof content !== "string" || content.trim().length < 15) {
    return NextResponse.json(
      { error: "反馈内容至少需要 15 个字" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rf_feedback")
    .insert({
      user_id: session.userId,
      content: content.trim(),
      rating: typeof rating === "number" ? Math.min(5, Math.max(1, rating)) : null,
      page: page || "general",
      metadata: metadata || {},
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
