import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isRfAdmin } from "@/lib/rf-admin";
import { isNystudentsNetEmail } from "@/lib/nystudents-email";

export type RfSession = {
  userId: string;
  email: string | undefined;
  isAdmin: boolean;
  hasMainAccess: boolean;
  /** app_metadata：黑魔法生成不限次（由超管在设置里勾选） */
  personaGenerateUnlimited: boolean;
  /** app_metadata：RF 使用已审批（nystudents.net 用户默认 true，外部申请需审批） */
  rfApproved: boolean;
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

    // nystudents.net users and admins are always approved; others need explicit approval
    const autoApproved =
      isRfAdmin(user.email) ||
      (!!user.email && isNystudentsNetEmail(user.email));
    const rfApproved =
      autoApproved || user.app_metadata?.rf_approved === true;

    return {
      userId: user.id,
      email: user.email,
      isAdmin: isRfAdmin(user.email),
      hasMainAccess: user.app_metadata?.has_main_access === true,
      personaGenerateUnlimited: user.app_metadata?.persona_generate_unlimited === true,
      rfApproved,
    };
  } catch {
    return null;
  }
}
