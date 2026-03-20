import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const refresh = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!refresh) {
    return NextResponse.json({
      gmail_authorized: false,
      gmail_email: null,
    });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      gmail_authorized: false,
      gmail_email: null,
    });
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  oauth2Client.setCredentials({ refresh_token: refresh });

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return NextResponse.json({
      gmail_authorized: true,
      gmail_email: (data?.email as string | undefined) ?? null,
    });
  } catch {
    return NextResponse.json({
      gmail_authorized: true,
      gmail_email: null,
    });
  }
}

export async function POST() {
  // noop: pure Gmail flow uses env vars
  return NextResponse.json({ ok: true });
}
