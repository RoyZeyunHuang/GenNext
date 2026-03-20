import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    if (!anthropic.apiKey) {
      return NextResponse.json(
        { error: "未配置 ANTHROPIC_API_KEY / CLAUDE_API_KEY" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      company_id: string;
    };
    const companyId = body.company_id;
    if (!companyId) {
      return NextResponse.json({ error: "company_id required" }, { status: 400 });
    }

    const { data: latestRows } = await supabase
      .from("emails")
      .select("from_email, to_email, subject, body, ai_summary, created_at")
      .eq("company_id", companyId)
      .eq("direction", "received")
      .order("created_at", { ascending: false })
      .limit(1);

    const latest = latestRows?.[0];

    const { data: historyRows } = await supabase
      .from("emails")
      .select("direction, subject, body, ai_summary, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(6);

    const latestReceived = latest
      ? {
          subject: latest.subject,
          ai_summary: latest.ai_summary,
          body: latest.body,
          created_at: latest.created_at,
          from_email: latest.from_email,
          to_email: latest.to_email,
        }
      : null;

    const history = (historyRows ?? []).map((r) => ({
      direction: r.direction,
      subject: r.subject,
      ai_summary: r.ai_summary,
      created_at: r.created_at,
    }));

    const systemPrompt =
      "你是一个专业的纽约地产公司的 BD 专员。你需要根据邮件往来生成回复邮件草稿。只输出最终 JSON，不要输出其它文字。";

    const userPrompt = `根据以下邮件往来，生成一封专业的回复邮件。
简短直接，不超过 100 字英文。
保持之前沟通的语气和上下文。
最新收到的邮件：${latestReceived ? JSON.stringify(latestReceived) : "null"}
历史往来：${JSON.stringify(history)}
只返回 JSON：{subject: 'Re: xxx', body: '回复正文'}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 900,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI 未返回 JSON" }, { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };

    return NextResponse.json({
      subject: parsed.subject ?? "Re:",
      body: parsed.body ?? "",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

