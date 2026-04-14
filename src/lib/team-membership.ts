import { supabase } from "@/lib/supabase";

/** Get all team IDs that a user belongs to */
export async function getUserTeamIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.team_id as string);
}

/** Check if user is a member of a specific team */
export async function isTeamMember(
  teamId: string,
  userId: string
): Promise<{ isMember: boolean; role: string | null }> {
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { isMember: false, role: null };
  return { isMember: true, role: data.role as string };
}

/** Record a team contribution (fire-and-forget) */
export function recordTeamContribution(
  teamId: string,
  userId: string,
  action: "doc_create" | "doc_edit" | "doc_share" | "generation",
  points: number,
  refId?: string
) {
  // Use service-role client to bypass RLS
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  import("@/lib/supabase-admin").then(({ getSupabaseAdmin }) => {
    const admin = getSupabaseAdmin();
    admin
      .from("team_contributions")
      .insert({
        team_id: teamId,
        user_id: userId,
        action,
        points,
        ref_id: refId ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[team_contributions] insert error:", error.message);
      });
  });
}
