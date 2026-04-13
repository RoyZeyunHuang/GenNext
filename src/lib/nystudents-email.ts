/** 免审核直接注册的邮箱域名 */
const AUTO_APPROVE_DOMAINS = ["@nystudents.net", "@uswoony.com", "@theairea.com"];

export function isNystudentsNetEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return false;
  return AUTO_APPROVE_DOMAINS.some((d) => e.endsWith(d));
}
