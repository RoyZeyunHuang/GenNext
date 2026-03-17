/**
 * Excel import column mapping for CRM outreach.
 * - Progress column → stage
 * - STATUS column → deal_status (and stage when Dropped/Signed w/ Others)
 * - Price → price, Term → term
 */

const PROGRESS_TO_STAGE: Record<string, string> = {
  "Pitch Sent": "Pitched",
  "First Meeting": "Meeting",
  "Contract Signed": "Won",
};

export function mapProgressToStage(progress: string | null | undefined): string {
  if (!progress) return "Not Started";
  return PROGRESS_TO_STAGE[progress] ?? progress;
}

export function mapStatusToDealStatusAndStage(
  status: string | null | undefined
): { deal_status: string; stage?: string; lost_reason?: string } {
  if (!status) return { deal_status: "Active" };
  const s = status.trim();
  if (s === "In Progress") return { deal_status: "Active" };
  if (s === "Need Follow Up") return { deal_status: "Need Follow Up" };
  if (s === "Dropped") return { deal_status: "Active", stage: "Lost", lost_reason: "Other" };
  if (s === "Signed w/ Others") return { deal_status: "Active", stage: "Lost", lost_reason: "Signed w/ Others" };
  return { deal_status: s };
}

export function normalizeOutreachRowFromImport(row: {
  Progress?: string | null;
  STATUS?: string | null;
  Price?: string | null;
  Term?: string | null;
  [k: string]: unknown;
}): { stage: string; deal_status: string; lost_reason?: string | null; price?: string | null; term?: string | null } {
  const stage = mapProgressToStage(row.Progress);
  const { deal_status, stage: statusStage, lost_reason } = mapStatusToDealStatusAndStage(row.STATUS);
  return {
    stage: statusStage ?? stage,
    deal_status,
    lost_reason: lost_reason ?? null,
    price: row.Price != null ? String(row.Price).trim() || null : null,
    term: row.Term != null ? String(row.Term).trim() || null : null,
  };
}
