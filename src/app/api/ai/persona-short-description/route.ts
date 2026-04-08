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

const SYSTEM = `你是中文角色文案编辑。用户会给你一个人设的「名字」和「完整角色档案（Markdown）」。
你的任务：用这个人自己的口吻，写**恰好一句**中文自我介绍。

硬性要求：
- 必须是**第一人称**（我…），像 TA 自己在社交平台简介里随口说了一句，不要用「他/她是一位…」等第三人称。
- **一句到底**：中间可用逗号或顿号，但不要换行、不要分点、不要编号、不要用 Markdown。
- 这一句里要尽量自然地带出这些信息里**档案中有的就实写，没有就合理推断**：**年龄或年龄段**（可写「二十多岁」「刚工作两年」等，禁止瞎编精确数字除非档案明确写了）、**名字或怎么称呼自己**、**身份**（职业/学业/生活状态）、**性格**、**爱好**——全部揉进同一句话，不要列清单感。
- 语气和用词必须符合档案里这个人的性格与说话习惯（文青/直爽/玩梗/冷淡等）。
- 只输出这一句正文，不要引号包裹，不要任何前缀说明或后缀。`;

function normalizeOneLine(raw: string): string {
  const t = raw
    .trim()
    .replace(/^["「『]|["」』]$/g, "")
    .replace(/\s+/g, " ")
    .replace(/。+$/g, "。");
  const one = t.split(/\n/)[0]?.trim() ?? "";
  return one.replace(/^["「『]|["」』]$/g, "").trim();
}

async function generateShortLine(name: string, bioMd: string): Promise<string> {
  const bio = (bioMd ?? "").trim();
  const userBlock =
    `名字：${name.trim() || "（未命名）"}\n\n角色档案：\n` +
    (bio || "（档案为空，请仅根据名字合理虚构一个轻量人设，仍写第一人称一句。）");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content: userBlock }],
  });

  const block = res.content[0];
  const text = block && block.type === "text" ? block.text : "";
  const line = normalizeOneLine(text);
  if (!line) throw new Error("模型未返回有效文本");
  return line;
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

    if (bulk) {
      const { data: rows, error: re } = await supabase
        .from("personas")
        .select("id, name, bio_md")
        .eq("user_id", gate.session.userId)
        .order("updated_at", { ascending: false });

      if (re) return NextResponse.json({ error: re.message }, { status: 500 });
      const list = rows ?? [];
      let ok = 0;
      const errors: string[] = [];

      for (const row of list) {
        try {
          const line = await generateShortLine(row.name, row.bio_md ?? "");
          const { error: ue } = await supabase
            .from("personas")
            .update({
              short_description: line,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
            .eq("user_id", gate.session.userId);
          if (ue) throw new Error(ue.message);
          ok++;
        } catch (e) {
          errors.push(`${row.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      return NextResponse.json({
        ok: true,
        updated: ok,
        total: list.length,
        errors: errors.length ? errors : undefined,
      });
    }

    const personaId = typeof body.persona_id === "string" ? body.persona_id.trim() : "";
    if (!personaId) {
      return NextResponse.json({ error: "persona_id 必填" }, { status: 400 });
    }

    let name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : "";
    let bioMd = typeof body.bio_md === "string" ? body.bio_md : "";

    const { data: existing, error: fe } = await supabase
      .from("personas")
      .select("id, name, bio_md, user_id, is_public")
      .eq("id", personaId)
      .maybeSingle();

    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "persona not found" }, { status: 404 });
    if (!canReadPersona(gate.session, existing)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!name) name = existing.name ?? "";
    if (!bioMd.trim()) bioMd = existing.bio_md ?? "";

    const short_description = await generateShortLine(name, bioMd);
    return NextResponse.json({ short_description });
  } catch (e) {
    console.error("[POST /api/ai/persona-short-description]", e);
    const message = e instanceof Error ? e.message : "内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
