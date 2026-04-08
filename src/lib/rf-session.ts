import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isRfAdmin } from "@/lib/rf-admin";

export type RfSession = {
  userId: string;
  email: string | undefined;
  isAdmin: boolean;
  hasMainAccess: boolean;
};

/**
 * Supabase Auth session from cookies (e.g. Rednote Factory).
 * Returns null when unauthenticated — GenNext main site API calls stay unrestricted.
 */
export async function getRfSession(): Promise<RfSession | null> {
  try {
    const cookieStore = cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* no-op in route handlers that only read session */
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    return {
      userId: user.id,
      email: user.email,
      isAdmin: isRfAdmin(user.email),
      hasMainAccess: user.app_metadata?.has_main_access === true,
    };
  } catch {
    return null;
  }
}
