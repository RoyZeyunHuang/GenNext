export type CompanyWithContacts = {
  id: string;
  name: string;
  email?: string | null;
  contacts?: Array<{
    name: string;
    email?: string | null;
    is_primary?: boolean | null;
  }> | null;
};

export function resolveRecipientEmail(company: CompanyWithContacts): string | null {
  const contacts = company.contacts ?? [];
  const primary = contacts.find((c) => c.is_primary && c.email?.trim());
  if (primary?.email) return primary.email.trim();
  const any = contacts.find((c) => c.email?.trim());
  if (any?.email) return any.email.trim();
  if (company.email?.trim()) return company.email.trim();
  return null;
}

export function resolveContactName(company: CompanyWithContacts): string {
  const contacts = company.contacts ?? [];
  const primary = contacts.find((c) => c.is_primary);
  if (primary?.name) return primary.name;
  return contacts[0]?.name ?? "there";
}

export function applyTemplate(
  text: string,
  vars: Record<string, string>
): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
