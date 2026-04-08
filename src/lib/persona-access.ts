import type { RfSession } from "@/lib/rf-session";

export type PersonaAccessRow = {
  user_id: string;
  is_public: boolean;
};

export function canReadPersona(session: RfSession, row: PersonaAccessRow): boolean {
  if (session.hasMainAccess || session.isAdmin) return true;
  return row.user_id === session.userId || row.is_public;
}

export function canWritePersona(session: RfSession, row: PersonaAccessRow): boolean {
  if (session.hasMainAccess || session.isAdmin) return true;
  return row.user_id === session.userId;
}

export function canSetPersonaPublic(session: RfSession): boolean {
  return session.isAdmin;
}

/** null = 主站/超管：不过滤；否则为 Supabase `.or()` 条件 */
export function personaListOrFilter(session: RfSession): string | null {
  if (session.hasMainAccess || session.isAdmin) return null;
  return `user_id.eq.${session.userId},is_public.eq.true`;
}
