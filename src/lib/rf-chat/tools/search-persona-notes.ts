import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canReadPersona } from "@/lib/persona-access";
import { embedText } from "@/lib/persona-rag/embeddings";
import {
  PERSONA_RETRIEVE_FINAL_K,
  normalizePersonaRpcRows,
} from "@/lib/persona-rag/retrieve-threshold";
import {
  ambiguous,
  invalidInput,
  notFound,
  ok,
  permissionDenied,
  toolError,
  type Tool,
} from "../types";
import { resolvePersona } from "../resolvers";

type Input = { persona?: string; query?: string };

export const searchPersonaNotesTool: Tool<Input> = {
  name: "search_persona_notes",
  description:
    "对某人格做 RAG 向量搜。`persona` 接受 name / id 任何形式。status=ok/ambiguous/not_found/permission_denied。",
  input_schema: {
    type: "object" as const,
    properties: {
      persona: { type: "string", description: "人格名或 id" },
      query: { type: "string", description: "检索主题，如「LIC 租房」" },
    },
    required: ["persona", "query"],
  },
  async execute(input, ctx) {
    const query = (input.query ?? "").trim();
    const personaKey = (input.persona ?? "").trim();
    if (!query || !personaKey) return invalidInput("persona 和 query 必填");

    const res = await resolvePersona(personaKey, { userId: ctx.userId });
    if (res.kind === "not_found") return notFound(`人格「${personaKey}」`);
    if (res.kind === "ambiguous") return ambiguous(res.candidates);
    const persona = res.persona;

    const sess = {
      userId: ctx.userId,
      email: ctx.email,
      isAdmin: ctx.isAdmin,
      hasMainAccess: ctx.hasMainAccess,
      personaGenerateUnlimited: ctx.personaGenerateUnlimited,
      rfApproved: true,
    };
    if (!canReadPersona(sess, { user_id: persona.user_id ?? "", is_public: persona.is_public })) {
      return permissionDenied(`你没有权限读「${persona.name ?? personaKey}」的笔记`);
    }

    try {
      const emb = await embedText(query);
      const admin = getSupabaseAdmin();
      const { data: rows, error } = await admin.rpc("match_persona_notes", {
        p_persona_id: persona.id,
        p_query_embedding: emb,
        p_match_count: PERSONA_RETRIEVE_FINAL_K,
      });
      if (error) return toolError(error.message);
      const notes = normalizePersonaRpcRows(rows, PERSONA_RETRIEVE_FINAL_K);
      return ok({
        persona_name: persona.name ?? "",
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          body_preview: (n.body ?? "").slice(0, 400),
          similarity: Number(Number(n.similarity ?? 0).toFixed(3)),
        })),
      });
    } catch (e) {
      return toolError(e instanceof Error ? e.message : String(e));
    }
  },
};
