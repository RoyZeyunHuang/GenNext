/**
 * 纯文本邮件末尾 ASCII 签名（由 @/lib/resend sendEmail 在纯文本时自动拼接）
 */
export function getPlainTextSignature(senderName?: string, senderEmail?: string): string {
  return `

Best,
${senderName || "Royce Huang"}
──────────────
INVO by USWOO
NYC Real Estate Marketing
${senderEmail || ""}`;
}
