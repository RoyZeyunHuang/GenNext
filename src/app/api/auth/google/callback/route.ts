import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return new NextResponse("No code provided", { status: 400 });
  }

  const dataRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:
        process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3000/api/auth/google/callback",
      grant_type: "authorization_code",
    }),
  });

  const data: any = await dataRes.json();

  const refreshToken: string | undefined = data?.refresh_token;

  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  if (refreshToken) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px">
        <h2>授权成功！</h2>
        <p>把下面这个 refresh token 复制到 .env.local 的 GMAIL_REFRESH_TOKEN：</p>
        <textarea style="width:100%;height:100px;font-size:14px">${esc(refreshToken)}</textarea>
        <p style="color:gray;margin-top:20px">复制完成后可以关闭这个页面。</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return new NextResponse(
    `<html><body style="font-family:sans-serif;padding:40px">
      <h2>授权失败</h2>
      <pre>${esc(JSON.stringify(data, null, 2))}</pre>
    </body></html>`,
    { headers: { "Content-Type": "text/html" }, status: 400 }
  );
}
