import { randomUUID } from "crypto";
import { Resend } from "resend";
import { getPlainTextSignature } from "@/lib/email-signature";
import { readPublicFileBytes } from "@/lib/public-file";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("未配置 RESEND_API_KEY");
  }
  return new Resend(key);
}

function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddressList(s?: string): string[] | undefined {
  if (!s?.trim()) return undefined;
  const arr = s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
}

/**
 * 通过 Resend 发信（Gmail API 仅保留读信）。
 * 返回 Resend email id，供 `emails.resend_id` 与 Webhook 关联。
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  from?: string,
  isHtml: boolean = false,
  options?: {
    senderName?: string;
    attachmentPath?: string;
    cc?: string;
    bcc?: string;
  }
): Promise<{ id: string | null }> {
  const senderEmail = (from || process.env.SENDER_EMAIL || "").trim();
  if (!senderEmail) {
    throw new Error("未配置 SENDER_EMAIL");
  }

  const senderName =
    options?.senderName?.trim() || process.env.SENDER_NAME?.trim() || undefined;

  const finalBody = isHtml
    ? body
    : body + getPlainTextSignature(senderName, senderEmail || undefined);

  let attachments: { filename: string; content: Buffer }[] | undefined;
  const ap = options?.attachmentPath?.trim();
  if (ap) {
    const { buffer, fileName } = await readPublicFileBytes(ap);
    attachments = [{ filename: fileName, content: buffer }];
  }

  const cc = parseAddressList(options?.cc);
  const bcc = parseAddressList(options?.bcc);

  const fromDisplay =
    process.env.RESEND_FROM_NAME?.trim() || "INVO by USWOO";
  const fromHeader = `${fromDisplay} <${senderEmail}>`;

  const resend = getResend();

  const common = {
    from: fromHeader,
    to: [to.trim()],
    subject,
    headers: {
      "X-Entity-Ref-ID": randomUUID(),
    },
    ...(cc?.length ? { cc } : {}),
    ...(bcc?.length ? { bcc } : {}),
    ...(attachments?.length ? { attachments } : {}),
  };

  const result = isHtml
    ? await resend.emails.send({
        ...common,
        html: body,
        text: stripHtmlToPlain(body) || " ",
      })
    : await resend.emails.send({
        ...common,
        text: finalBody,
      });

  if (result.error) {
    const msg =
      typeof result.error === "object" &&
      result.error !== null &&
      "message" in result.error
        ? String((result.error as { message: string }).message)
        : "Resend 发送失败";
    throw new Error(msg);
  }

  return { id: result.data?.id ?? null };
}
