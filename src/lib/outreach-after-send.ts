import type { SupabaseClient } from "@supabase/supabase-js";

/** 与业务顺序一致：仅当当前为 Not Started 时发信会升到 Email Pitched */
export const OUTREACH_STAGE_PIPELINE = [
  "Not Started",
  "Email Pitched",
  "Pitched",
  "Meeting",
  "Negotiating",
  "Won",
  "Lost",
] as const;

const NOT_STARTED_ALIASES = new Set([
  "not_started",
  "new",
  "pending",
  "未开始",
]);

function effectiveOutreachStage(
  stage: string | null | undefined,
  status: string | null | undefined
): string {
  const s = typeof stage === "string" ? stage.trim() : "";
  if (s) return s;
  const st = typeof status === "string" ? status.trim() : "";
  if (st) return st;
  return "Not Started";
}

/** 与 OUTREACH_STAGE_PIPELINE 忽略大小写匹配；认不出的阶段返回 null（不误升 Email Pitched） */
function pipelineIndexForStage(raw: string | null | undefined): number | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return 0;
  const idx = OUTREACH_STAGE_PIPELINE.findIndex((s) => s.toLowerCase() === t);
  if (idx >= 0) return idx;
  if (NOT_STARTED_ALIASES.has(t)) return 0;
  return null;
}

function shouldPromoteToEmailPitched(
  stage: string | null | undefined,
  status: string | null | undefined
): boolean {
  const emailPitchedIdx = OUTREACH_STAGE_PIPELINE.indexOf("Email Pitched");
  const fromStage = pipelineIndexForStage(
    typeof stage === "string" ? stage : undefined
  );
  const fromStatus = pipelineIndexForStage(
    typeof status === "string" ? status : undefined
  );
  const primary =
    typeof stage === "string" && stage.trim()
      ? fromStage
      : typeof status === "string" && status.trim()
        ? fromStatus
        : fromStage ?? fromStatus;
  if (primary === null) {
    const eff = effectiveOutreachStage(stage, status).trim().toLowerCase();
    return (
      eff === "" ||
      eff === "not started" ||
      NOT_STARTED_ALIASES.has(eff)
    );
  }
  return primary < emailPitchedIdx;
}

/**
 * 发信成功后：
 * - 若该楼盘尚无 outreach：新建一条，stage/status 为 Email Pitched。
 * - 若已有（含同一 property_id 多条）：逐条更新 last_email_at；阶段早于 Email Pitched（含别名/大小写）则升为 Email Pitched。
 * - 同时写入 legacy `status` 列，避免只看 status 的界面不刷新。
 */
export async function updateOutreachAfterEmailSent(
  supabase: SupabaseClient,
  propertyId: string | null | undefined
): Promise<void> {
  if (!propertyId) return;

  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("outreach")
    .select("id, stage, status")
    .eq("property_id", propertyId);

  if (error) {
    console.error("[outreach-after-send] list outreach failed", propertyId, error);
    return;
  }

  if (!rows?.length) {
    const { error: insErr } = await supabase.from("outreach").insert({
      property_id: propertyId,
      stage: "Email Pitched",
      status: "Email Pitched",
      deal_status: "Active",
      last_email_at: now,
      needs_attention: false,
      updated_at: now,
      notes: "（系统）首次发信自动创建",
    });
    if (insErr) {
      console.error("[outreach-after-send] insert outreach failed", propertyId, insErr);
    }
    return;
  }

  for (const row of rows as {
    id: string;
    stage?: string | null;
    status?: string | null;
  }[]) {
    const payload: Record<string, unknown> = {
      last_email_at: now,
      needs_attention: false,
      updated_at: now,
    };

    if (shouldPromoteToEmailPitched(row.stage, row.status)) {
      payload.stage = "Email Pitched";
      payload.status = "Email Pitched";
    }

    const { error: upErr } = await supabase.from("outreach").update(payload).eq("id", row.id);
    if (upErr) {
      console.error("[outreach-after-send] update outreach failed", row.id, upErr);
    }
  }
}
