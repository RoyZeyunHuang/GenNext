import type { RfSession } from "@/lib/rf-session";

export type PersonaVisibility = "private" | "main_site" | "public" | "assigned";

export type PersonaAccessRow = {
  user_id: string;
  is_public: boolean;
  visibility?: PersonaVisibility;
  /** Only populated for visibility='assigned' when needed */
  allowed_user_ids?: string[];
};

/**
 * Can this session read the persona?
 *
 * visibility logic (falls back to is_public if visibility column missing):
 *  - private   → admin / owner only
 *  - main_site → admin + has_main_access users
 *  - public    → everyone
 *  - assigned  → admin + explicitly listed users
 */
export function canReadPersona(session: RfSession, row: PersonaAccessRow): boolean {
  if (session.isAdmin) return true;

  const vis = row.visibility ?? (row.is_public ? "public" : "private");

  switch (vis) {
    case "public":
      return true;
    case "main_site":
      return session.hasMainAccess || row.user_id === session.userId;
    case "assigned":
      return (
        row.user_id === session.userId ||
        (row.allowed_user_ids?.includes(session.userId) ?? false)
      );
    case "private":
    default:
      return row.user_id === session.userId;
  }
}

export function canWritePersona(session: RfSession, row: PersonaAccessRow): boolean {
  if (session.hasMainAccess || session.isAdmin) return true;
  return row.user_id === session.userId;
}

export function canSetPersonaVisibility(session: RfSession): boolean {
  return session.isAdmin;
}

/** @deprecated Use canSetPersonaVisibility */
export function canSetPersonaPublic(session: RfSession): boolean {
  return session.isAdmin;
}

/**
 * Build Supabase `.or()` filter for persona list query.
 * Returns null if no filter needed (admin/main-site sees all).
 */
export function personaListOrFilter(session: RfSession): string | null {
  // Admin sees everything
  if (session.isAdmin) return null;

  // Main-site users: own + public + main_site
  if (session.hasMainAccess) {
    return `user_id.eq.${session.userId},visibility.eq.public,visibility.eq.main_site`;
  }

  // RF users: own + public only
  return `user_id.eq.${session.userId},visibility.eq.public`;
}
