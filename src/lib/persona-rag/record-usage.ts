import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * 黑魔法生成通过后：人格总调用 +1；每条本次 RAG 命中的笔记 +1（去重按 id）；当前用户终身累计 +1。
 * 无 SERVICE_ROLE 时用 anon 调 RPC（需 migration grant execute）。
 */
export async function recordPersonaRagInvocation(
  personaId: string,
  noteIds: string[],
  userId: string
): Promise<void> {
  const distinct = [...new Set(noteIds.filter(Boolean))];
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc("increment_persona_rag_usage", {
      p_persona_id: personaId,
      p_note_ids: distinct,
      p_user_id: userId,
    });
    if (error) {
      console.error("[recordPersonaRagInvocation]", error.message);
    }
  } catch (e) {
    console.error("[recordPersonaRagInvocation]", e instanceof Error ? e.message : e);
  }
}
