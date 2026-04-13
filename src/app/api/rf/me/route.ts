import { NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";
import { getPersonaGenerateWeeklyLimit, getPersonaGenerateUsageThisWeek } from "@/lib/persona-generate-quota";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Threshold: show forced feedback modal after this many total generations */
const FEEDBACK_AFTER_GENERATIONS = 10;

export async function GET() {
  const session = await getRfSession();
  if (!session) {
    return NextResponse.json({
      userId: null,
      email: null,
      isAdmin: false,
      hasMainAccess: false,
      personaGenerateUnlimited: false,
      personaGenerateUsed: 0,
      personaGenerateLimit: getPersonaGenerateWeeklyLimit(),
      personaGenerateRemaining: null,
      totalGenerations: 0,
      feedbackRequired: false,
    });
  }

  const limit = getPersonaGenerateWeeklyLimit();
  let used = 0;
  if (!session.personaGenerateUnlimited && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    used = await getPersonaGenerateUsageThisWeek(session.userId);
  }

  const remaining =
    session.personaGenerateUnlimited ? null : Math.max(0, limit - used);

  // Fetch total generations + feedback status for forced-feedback logic
  let totalGenerations = 0;
  let hasFeedback = false;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = getSupabaseAdmin();
    const [genResult, fbResult] = await Promise.all([
      supabase
        .from("user_persona_generate_totals")
        .select("total_generations")
        .eq("user_id", session.userId)
        .maybeSingle(),
      supabase
        .from("rf_feedback")
        .select("id")
        .eq("user_id", session.userId)
        .limit(1),
    ]);
    totalGenerations = genResult.data?.total_generations ?? 0;
    hasFeedback = (fbResult.data?.length ?? 0) > 0;
  }

  // Main-site users (hasMainAccess) are exempt from forced feedback
  const feedbackRequired =
    !session.hasMainAccess &&
    totalGenerations >= FEEDBACK_AFTER_GENERATIONS &&
    !hasFeedback;

  return NextResponse.json({
    userId: session.userId,
    email: session.email ?? null,
    isAdmin: session.isAdmin,
    hasMainAccess: session.hasMainAccess,
    personaGenerateUnlimited: session.personaGenerateUnlimited,
    personaGenerateUsed: used,
    personaGenerateLimit: limit,
    personaGenerateRemaining: remaining,
    totalGenerations,
    feedbackRequired,
  });
}
