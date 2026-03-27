import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_SIGNATURE_SENDER_NAME,
  DEFAULT_SIGNATURE_TITLE_LINE,
  EMAIL_SIGNATURE_KEY_NAME,
  EMAIL_SIGNATURE_KEY_TITLE,
  getEmailSignatureSettings,
} from "@/lib/email-signature-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET：当前解析后的署名 + 原始表单值（空表示走默认/环境变量） */
export async function GET() {
  try {
    const { data } = await supabase
      .from("user_settings")
      .select("key, value")
      .in("key", [EMAIL_SIGNATURE_KEY_NAME, EMAIL_SIGNATURE_KEY_TITLE]);

    const map = new Map(
      (data ?? []).map((r: { key: string; value: string | null }) => [
        r.key,
        r.value ?? "",
      ])
    );

    const resolved = await getEmailSignatureSettings(supabase);

    return NextResponse.json({
      sender_name_stored: map.get(EMAIL_SIGNATURE_KEY_NAME) ?? "",
      signature_title_line_stored: map.get(EMAIL_SIGNATURE_KEY_TITLE) ?? "",
      sender_name_resolved: resolved.senderName,
      signature_title_line_resolved: resolved.signatureTitleLine,
      defaults: {
        sender_name: DEFAULT_SIGNATURE_SENDER_NAME,
        signature_title_line: DEFAULT_SIGNATURE_TITLE_LINE,
      },
      env_sender_name: process.env.SENDER_NAME?.trim() ?? null,
      sender_email_hint: process.env.SENDER_EMAIL?.trim() ?? null,
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : e &&
            typeof e === "object" &&
            "message" in e &&
            typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "加载署名设置失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const sender_name =
      typeof body.sender_name === "string" ? body.sender_name : "";
    const signature_title_line =
      typeof body.signature_title_line === "string"
        ? body.signature_title_line
        : "";

    const now = new Date().toISOString();
    const { error } = await supabase.from("user_settings").upsert(
      [
        {
          key: EMAIL_SIGNATURE_KEY_NAME,
          value: sender_name.trim(),
          updated_at: now,
        },
        {
          key: EMAIL_SIGNATURE_KEY_TITLE,
          value: signature_title_line.trim(),
          updated_at: now,
        },
      ],
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || "保存署名失败" },
        { status: 500 }
      );
    }

    const resolved = await getEmailSignatureSettings(supabase);
    return NextResponse.json({
      ok: true,
      sender_name_resolved: resolved.senderName,
      signature_title_line_resolved: resolved.signatureTitleLine,
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : e &&
            typeof e === "object" &&
            "message" in e &&
            typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "保存署名失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
