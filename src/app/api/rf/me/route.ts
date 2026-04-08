import { NextResponse } from "next/server";
import { getRfSession } from "@/lib/rf-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRfSession();
  if (!session) {
    return NextResponse.json({ userId: null, email: null, isAdmin: false, hasMainAccess: false });
  }
  return NextResponse.json({
    userId: session.userId,
    email: session.email ?? null,
    isAdmin: session.isAdmin,
    hasMainAccess: session.hasMainAccess,
  });
}
