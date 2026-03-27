import {
  DEFAULT_SIGNATURE_SENDER_NAME,
  DEFAULT_SIGNATURE_TITLE_LINE,
} from "@/lib/email-signature-settings";

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapEmailHtml(
  bodyContent: string,
  ctaText?: string,
  ctaUrl?: string,
  propertyName?: string,
  senderName?: string,
  senderEmail?: string,
  /** 署名第二行，如「BD Team · INVO by USWOO」 */
  signatureTitleLine?: string
): string {
  const safeName = escapeHtmlAttr(senderName || DEFAULT_SIGNATURE_SENDER_NAME);
  const safeTitle = escapeHtmlAttr(
    signatureTitleLine?.trim() || DEFAULT_SIGNATURE_TITLE_LINE
  );
  const safeEmail = escapeHtmlAttr(senderEmail || "");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:Arial,Helvetica,'PingFang SC','Microsoft YaHei',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e7e5e4;">
              
              <!-- Header: white bg -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#ffffff;padding:18px 28px;border-bottom:1px solid #e7e5e4;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <span style="color:#d72638;font-size:22px;font-weight:900;letter-spacing:2px;font-family:Arial Black,Arial,sans-serif;">INVO</span>
                          <span style="color:#d72638;font-size:8px;letter-spacing:2px;opacity:0.6;margin-left:8px;">BY USWOO</span>
                        </td>
                        <td style="text-align:right;color:#999;font-size:11px;">NYC Real Estate Marketing</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Body with red left border -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="4" style="background-color:#d72638;"></td>
                  <td style="padding:28px;font-size:14px;line-height:1.8;color:#1C1917;">
                    
                    ${propertyName ? '<p style="margin:0 0 6px;font-size:11px;color:#d72638;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Partnership inquiry · ' + propertyName + '</p>' : ''}
                    
                    ${bodyContent.replace(/\n/g, "<br>")}
                    
                    ${ctaText && ctaUrl ? '<table cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr><td style="background-color:#d72638;border-radius:6px;padding:12px 28px;"><a href="' + ctaUrl + '" style="color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;">' + ctaText + "</a></td></tr></table>" : ""}
                    
                    <!-- Signature -->
                    <table cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e7e5e4;padding-top:16px;width:100%;">
                      <tr><td style="font-size:13px;font-weight:bold;color:#1C1917;">${safeName}</td></tr>
                      <tr><td style="font-size:12px;color:#78716C;padding-top:2px;">${safeTitle}</td></tr>
                      <tr><td style="font-size:12px;color:#a8a29e;padding-top:2px;">${safeEmail}</td></tr>
                    </table>
                    
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

