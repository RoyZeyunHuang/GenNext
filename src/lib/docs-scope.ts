import type { RfSession } from "@/lib/rf-session";

/** Admin / mainAccess → no filter (shared pool). RF → public + own only. */
export function docsOwnerOrFilter(session: RfSession | null): string | null {
  if (!session) return null;
  if (session.isAdmin || session.hasMainAccess) return null;
  return `owner_id.is.null,owner_id.eq.${session.userId}`;
}

/**
 * Build filter for team docs: only docs belonging to teams the user is in.
 * Returns team_id values to filter by, or null if no team filter needed.
 */
export function docsTeamFilter(teamId: string | null): string | null {
  if (!teamId) return null;
  return teamId;
}

/** Admin / mainAccess can edit anything in the pool. RF → own only. */
export function canModifyByOwner(session: RfSession | null, ownerId: string | null): boolean {
  if (!session) return true;
  if (session.isAdmin || session.hasMainAccess) return true;
  if (ownerId === null) return false;
  return ownerId === session.userId;
}

/**
 * New row owner_id:
 *  - no session → unset (legacy public)
 *  - super admin → public or self based on is_public flag
 *  - others (mainAccess / RF) → always self (private)
 */
export function resolveOwnerIdForCreate(
  session: RfSession | null,
  isPublic?: boolean
): string | null | undefined {
  if (!session) return undefined;
  if (session.isAdmin) return isPublic === true ? null : session.userId;
  return session.userId;
}

/** Only super admin can toggle public/private. */
export function resolveOwnerIdForUpdate(
  session: RfSession | null,
  isPublic: boolean | undefined,
  currentOwnerId: string | null
): string | null | undefined {
  if (isPublic === undefined) return undefined;
  if (!session?.isAdmin) return undefined;
  return isPublic ? null : (currentOwnerId ?? session.userId);
}
