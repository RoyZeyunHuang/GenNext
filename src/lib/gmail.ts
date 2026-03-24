import { google } from "googleapis";

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/auth/google/callback";
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 未配置");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getGmailClient() {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    throw new Error("未配置 GMAIL_REFRESH_TOKEN，请先在 .env.local 填入");
  }
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export function buildGoogleAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ],
  });
}

function base64UrlToBuffer(base64Url: string) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  return Buffer.from(padded, "base64");
}

function findHeader(headers: Array<{ name?: string | null; value?: string | null }> | undefined, headerName: string) {
  const h = (headers ?? []).find((x) => (x.name ?? "").toLowerCase() === headerName.toLowerCase());
  return h?.value ?? "";
}

function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Gmail payload.parts 可能多层嵌套（multipart），用于 bounce 解析等 */
type GmailPart = {
  mimeType?: string | null;
  body?: { data?: string | null; size?: number | null };
  parts?: GmailPart[];
};

function collectPlainBodies(parts: GmailPart[] | undefined, acc: string[]): void {
  if (!parts?.length) return;
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      acc.push(base64UrlToBuffer(p.body.data).toString("utf-8"));
    } else if (p.mimeType === "text/html" && p.body?.data) {
      acc.push(stripHtmlToPlain(base64UrlToBuffer(p.body.data).toString("utf-8")));
    }
    if (p.parts?.length) collectPlainBodies(p.parts, acc);
  }
}

export function extractPlainTextFromGmailPayload(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const acc: string[] = [];
  if (payload.body?.data) {
    acc.push(base64UrlToBuffer(payload.body.data).toString("utf-8"));
  }
  collectPlainBodies(payload.parts, acc);
  return acc.join("\n\n");
}

/** 搜索收件箱（同步、退信检测等）；发信请使用 @/lib/resend */
export async function searchEmails(query: string, maxResults: number = 10) {
  const gmail = await getGmailClient();

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const ids = list.data.messages?.map((m) => m.id).filter(Boolean) ?? [];
  if (!ids.length) return [];

  const emails = await Promise.all(
    ids.map(async (id) => {
      if (!id) return null;
      const detail = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });

      const payload = detail.data.payload;
      const headers = payload?.headers ?? [];

      const from = findHeader(headers, "From");
      const to = findHeader(headers, "To");
      const subject = findHeader(headers, "Subject");
      const date = findHeader(headers, "Date");

      const body = extractPlainTextFromGmailPayload(payload as GmailPart);

      return {
        gmail_message_id: id,
        from,
        to,
        subject,
        date,
        body,
        snippet: detail.data.snippet ?? "",
      };
    })
  );

  return emails.filter(Boolean);
}
