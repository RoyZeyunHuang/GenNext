/** Rednote Factory admins (comma-separated emails in RF_ADMIN_EMAILS). */
export function isRfAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.RF_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
