import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLORS = ["#4a90d9", "#21c354", "#e67e22", "#9b59b6", "#e74c3c", "#1abc9c", "#f39c12", "#3498db"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hooks = [], personas = [] } = body as {
      hooks: { name: string; description?: string }[];
      personas: { id: string; title: string }[];
    };
    if (!anthropic.apiKey) {
      return NextResponse.json({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }, { status: 503 });
    }

    const { data: accountRows } = await supabase
      .from("accounts")
      .select("name, color")
      .order("name", { ascending: true });
    const accountsList = (accountRows ?? []).map((a) => ({
      name: a.name as string,
      color: (a.color as string | null) ?? null,
    }));

    const systemPrompt = `你是纽约租房内容策略师。根据「现有账号列表」「钩子列表」和「人格模板列表」，生成账号分配方案。
要求：
1. 每个账号绑定一个钩子 + 一个人格，并给出一句话定位
2. 账号名称必须从现有账号列表中选择，严格使用其中的 name，不要自己造新名字
3. 不要生成账号别名，只用真实账号名

现有账号列表（accounts）：
${JSON.stringify(accountsList)}

钩子列表（hooks）：
${JSON.stringify(hooks.map((h) => ({ name: h.name, desc: h.description })))} 

人格模板列表（personas）：
${JSON.stringify(personas.map((p) => ({ id: p.id, title: p.title })))} 

只返回 JSON 数组（最多 8 个）：
[
  {
    "account_name": "必须来自 accounts.name 的账号名",
    "hook_index": 0,
    "persona_id": "人格 doc 的 id",
    "positioning": "一句话定位"
  }
]`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: "生成账号分配（hook_index 从 0 开始）" }],
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    const raw = jsonMatch
      ? (JSON.parse(jsonMatch[0]) as {
          account_name: string;
          hook_index: number;
          persona_id: string;
          positioning: string;
        }[])
      : [];
    const personaIds = new Set(personas.map((p) => p.id));
    const personaMap = new Map(personas.map((p) => [p.id, p.title]));
    const accountMap = new Map(accountsList.map((a) => [a.name, a]));

    const accounts = raw
      .slice(0, 8)
      .map((a, i) => {
        const name = String(a.account_name || "").trim();
        const base = accountMap.get(name);
        if (!base) return null;
        return {
          account_name: base.name,
          hook_index: Math.min(Math.max(0, Number(a.hook_index) || 0), hooks.length - 1),
          persona_doc_id: personaIds.has(a.persona_id) ? a.persona_id : personas[0]?.id ?? null,
          persona_name: personaMap.get(a.persona_id) ?? personas[0]?.title ?? null,
          color: base.color ?? COLORS[i % COLORS.length],
          positioning: String(a.positioning || "").trim(),
          sort_order: i,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "分配失败" }, { status: 500 });
  }
}
