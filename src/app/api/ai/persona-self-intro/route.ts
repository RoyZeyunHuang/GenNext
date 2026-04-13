import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { canReadPersona } from "@/lib/persona-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM = `你是一个虚拟人设的文案编辑。用户会给你一个人设的「名字」和「完整角色档案（Markdown）」。
你的任务：用这个人写小红书时的口吻和语气，写一段**简短的自我介绍**。

硬性要求：
- 必须是**第一人称**，像这个人在小红书个人主页写的"关于我"，语气随性、真实、有个人风格。
- 内容要自然地包含：**名字**、**年龄或年龄段**、**身份/职业/学业**、**性格特点**、**生活状态或背景小传**。
- 写成一小段话（3-5 句），不要列清单、不要分点、不要编号。
- 字数控制在 60-100 字以内，要精炼。
- 语气用词必须符合档案里这个人的性格和说话习惯，像 TA 自己写的，不是别人写的。
- 可以适度用 emoji（1-2 个），但不要过度。
- 不要用 Markdown 格式，不要引号包裹，不要任何前缀说明。
- 直接输出正文。`;

async function generateSelfIntro(
  name: string,
  bioMd: string
): Promise<string> {
  const bio = (bioMd ?? "").trim();
  const userBlock =
    `名字：${name.trim() || "（未命名）"}\n\n角色档案：\n` +
    (bio || "（档案为空，请仅根据名字合理虚构一个轻量人设。）");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: "user", content: userBlock }],
  });

  const block = res.content[0];
  const text = block && block.type === "text" ? block.text : "";
  const cleaned = text
    .trim()
    .replace(/^["「『]|["」』]$/g, "")
    .trim();
  if (!cleaned) throw new Error("模型未返回有效文本");
  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requirePersonaRagRoute();
    if (!gate.ok) return gate.response;

    if (!anthropic.apiKey) {
      return NextResponse.json(
        { error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const bulk = body.bulk === true;

    // ── Bulk mode: generate for all user's personas ──
    if (bulk) {
      // Only admin can bulk-generate
      if (!gate.session.isAdmin) {
        return NextResponse.json(
          { error: "仅管理员可批量生成" },
          { status: 403 }
        );
      }

      const { data: rows, error: re } = await supabase
        .from("personas")
        .select("id, name, bio_md, is_public")
        .eq("is_public", true)
        .order("updated_at", { ascending: false });

      if (re) return NextResponse.json({ error: re.message }, { status: 500 });
      const list = rows ?? [];
      let ok = 0;
      const errors: string[] = [];

      for (const row of list) {
        try {
          const intro = await generateSelfIntro(row.name, row.bio_md ?? "");
          const { error: ue } = await supabase
            .from("personas")
            .update({
              self_intro: intro,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (ue) throw new Error(ue.message);
          ok++;
        } catch (e) {
          errors.push(
            `${row.name}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
        // Rate-limit between calls
        await new Promise((r) => setTimeout(r, 400));
      }

      return NextResponse.json({
        ok: true,
        updated: ok,
        total: list.length,
        errors: errors.length ? errors : undefined,
      });
    }

    // ── Single mode ──
    const personaId =
      typeof body.persona_id === "string" ? body.persona_id.trim() : "";
    if (!personaId) {
      return NextResponse.json(
        { error: "persona_id 必填" },
        { status: 400 }
      );
    }

    const { data: existing, error: fe } = await supabase
      .from("personas")
      .select("id, name, bio_md, user_id, is_public")
      .eq("id", personaId)
      .maybeSingle();

    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
    if (!existing)
      return NextResponse.json({ error: "persona not found" }, { status: 404 });
    if (!canReadPersona(gate.session, existing)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const selfIntro = await generateSelfIntro(
      existing.name ?? "",
      existing.bio_md ?? ""
    );

    // Write back to DB
    const { error: ue } = await supabase
      .from("personas")
      .update({
        self_intro: selfIntro,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personaId);

    if (ue) {
      return NextResponse.json({ error: ue.message }, { status: 500 });
    }

    return NextResponse.json({ self_intro: selfIntro });
  } catch (e) {
    console.error("[POST /api/ai/persona-self-intro]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
