/**
 * 模板渲染 + HTML 包装。与 src/lib/email-template.ts / email-helpers.ts 的语义保持一致,
 * 但精简到 mjs,不引入 Next.js / TS 依赖。改 INVO 视觉时这两边都要同步。
 */

const DEFAULT_SIGNATURE_TITLE_LINE = "BD Team · INVO by USWOO";

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyTemplate(text, vars) {
  let out = String(text ?? "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v ?? ""));
  }
  return out;
}

export function contactFirstName(name, fallback = "there") {
  const s = String(name ?? "").trim();
  if (!s) return fallback;
  const first = s.split(/\s+/)[0] ?? "";
  return first || fallback;
}

export function joinEnglishAnd(parts) {
  const cleaned = parts.map((p) => String(p ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

/**
 * 从 contact + 关联楼盘列表构造模板变量。
 * - properties: [{name, city, area, address, build_year, units, role}]
 */
export function buildTemplateVars(contact, company, properties) {
  const sorted = [...properties].sort((a, b) => (b.units ?? -1) - (a.units ?? -1));
  const top2 = sorted.slice(0, 2);
  const propertyName =
    sorted.length === 0
      ? "your portfolio"
      : sorted.length === 1
        ? sorted[0].name
        : joinEnglishAnd(top2.map((p) => p.name));

  const seenCity = new Set();
  const cities = [];
  for (const p of sorted) {
    const c = (p.area || p.city || "").trim();
    if (!c) continue;
    const k = c.toLowerCase();
    if (seenCity.has(k)) continue;
    seenCity.add(k);
    cities.push(c);
    if (cities.length >= 2) break;
  }
  const neighborhood = joinEnglishAnd(cities) || "the area";

  return {
    contact_name: contactFirstName(contact?.name),
    company_name: company?.name ?? "",
    company_role: properties[0]?.role ?? "",
    property_name: propertyName,
    cities_two: neighborhood,
    neighborhood,
  };
}

/**
 * INVO 邮件 HTML 包装(与 src/lib/email-template.ts wrapEmailHtml 等价)。
 * 改这里时同步改 src/lib/email-template.ts。
 */
export function wrapEmailHtml({
  bodyContent,
  propertyName,
  senderName,
  senderEmail,
  signatureTitleLine,
}) {
  const safeName = escapeHtmlAttr(senderName || "Royce Huang");
  const safeTitle = escapeHtmlAttr(signatureTitleLine?.trim() || DEFAULT_SIGNATURE_TITLE_LINE);
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
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="4" style="background-color:#d72638;"></td>
                  <td style="padding:28px;font-size:14px;line-height:1.8;color:#1C1917;">
                    ${propertyName ? '<p style="margin:0 0 6px;font-size:11px;color:#d72638;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Partnership inquiry · ' + escapeHtmlAttr(propertyName) + '</p>' : ''}
                    ${String(bodyContent ?? "").replace(/\n/g, "<br>")}
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
