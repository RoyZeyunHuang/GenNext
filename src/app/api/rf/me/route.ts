import { NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";
import { getPersonaGenerateDailyLimit, getPersonaGenerateUsageToday } from "@/lib/persona-generate-quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      personaGenerateLimit: getPersonaGenerateDailyLimit(),
      personaGenerateRemaining: null,
    });
  }

  const limit = getPersonaGenerateDailyLimit();
  let used = 0;
  if (!session.personaGenerateUnlimited && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    used = await getPersonaGenerateUsageToday(session.userId);
  }

  const remaining =
    session.personaGenerateUnlimited ? null : Math.max(0, limit - used);

  return NextResponse.json({
    userId: session.userId,
    email: session.email ?? null,
    isAdmin: session.isAdmin,
    hasMainAccess: session.hasMainAccess,
    personaGenerateUnlimited: session.personaGenerateUnlimited,
    personaGenerateUsed: used,
    personaGenerateLimit: limit,
    personaGenerateRemaining: remaining,
  });
}
