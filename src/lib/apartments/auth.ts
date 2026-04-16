/**
 * Admin gate: single-admin model.
 * Email allowlist comes from ADMIN_EMAILS (comma-separated env var).
 */

import { createSupabaseServerClient } from "@/lib/supabase-server";

function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface SessionUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supa = createSupabaseServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) return null;
  const allow = adminEmails();
  return {
    id: user.id,
    email: user.email,
    isAdmin: allow.length > 0 && allow.includes(user.email.toLowerCase()),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new Response("unauthorized", { status: 401 });
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!u.isAdmin) throw new Response("forbidden", { status: 403 });
  return u;
}
