import { NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";
import { canUseRagFeature } from "@/lib/persona-rag/permissions";

export type PersonaRagSession = NonNullable<Awaited<ReturnType<typeof getRfSession>>>;

export type PersonaRagRouteGate =
  | { ok: true; session: PersonaRagSession }
  | { ok: false; response: NextResponse };

export async function requirePersonaRagRoute(): Promise<PersonaRagRouteGate> {
  const session = await getRfSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "未登录" }, { status: 401 }),
    };
  }
  if (!canUseRagFeature(session)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
