import { google } from "googleapis";
import { getPlainTextSignature } from "@/lib/email-signature";

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
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ],
  });
}

function base64UrlToBuffer(base64Url: string) {
  // Gmail API returns base64url; Buffer expects base64
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  return Buffer.from(padded, "base64");
}

function findHeader(headers: Array<{ name?: string | null; value?: string | null }> | undefined, headerName: string) {
  const h = (headers ?? []).find((x) => (x.name ?? "").toLowerCase() === headerName.toLowerCase());
  return h?.value ?? "";
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  from?: string,
  isHtml: boolean = false,
  options?: { senderName?: string }
) {
  const gmail = await getGmailClient();
  const senderEmail = (from || process.env.SENDER_EMAIL || "").trim();
  if (!senderEmail) {
    throw new Error("未配置 SENDER_EMAIL");
  }

  const senderName =
    options?.senderName?.trim() || process.env.SENDER_NAME?.trim() || undefined;

  const finalBody =
    isHtml
      ? body
      : body + getPlainTextSignature(senderName, senderEmail || undefined);

  const message = [
    `From: ${senderEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
    "",
    finalBody,
  ].join("\n");

  const encodedMessage = Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  return result.data;
}

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

      let body = "";
      // Prefer plain text part if present
      if (payload?.body?.data) {
        body = base64UrlToBuffer(payload.body.data).toString("utf-8");
      } else if (payload?.parts?.length) {
        const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          body = base64UrlToBuffer(textPart.body.data).toString("utf-8");
        }
      }

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
