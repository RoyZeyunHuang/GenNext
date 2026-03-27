import type { SupabaseClient } from "@supabase/supabase-js";

export const EMAIL_SIGNATURE_KEY_NAME = "email_signature_sender_name";
export const EMAIL_SIGNATURE_KEY_TITLE = "email_signature_title_line";

/** 信纸底部第二行默认文案（与历史模板一致） */
export const DEFAULT_SIGNATURE_TITLE_LINE = "BD Team · INVO by USWOO";

/** 未配置时的占位姓名（与旧版硬编码一致，可被 DB / SENDER_NAME 覆盖） */
export const DEFAULT_SIGNATURE_SENDER_NAME = "Royce Huang";

export async function getEmailSignatureSettings(
  supabase: SupabaseClient
): Promise<{ senderName: string; signatureTitleLine: string }> {
  const { data } = await supabase
    .from("user_settings")
    .select("key, value")
    .in("key", [EMAIL_SIGNATURE_KEY_NAME, EMAIL_SIGNATURE_KEY_TITLE]);

  const map = new Map(
    (data ?? []).map((r: { key: string; value: string | null }) => [
      r.key,
      (r.value ?? "").trim(),
    ])
  );

  const nameFromDb = map.get(EMAIL_SIGNATURE_KEY_NAME) ?? "";
  const titleFromDb = map.get(EMAIL_SIGNATURE_KEY_TITLE) ?? "";

  return {
    senderName:
      nameFromDb ||
      process.env.SENDER_NAME?.trim() ||
      DEFAULT_SIGNATURE_SENDER_NAME,
    signatureTitleLine: titleFromDb || DEFAULT_SIGNATURE_TITLE_LINE,
  };
}
