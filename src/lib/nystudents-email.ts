/** Rednote Factory 自助注册仅允许该校邮域名（与 UI 提示一致）。 */
const SUFFIX = "@nystudents.net";

export function isNystudentsNetEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return false;
  return e.endsWith(SUFFIX);
}
