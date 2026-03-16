import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      plan_id,
      date_from,
      date_to,
      theme,
      hooks = [],
      accounts = [],
    } = body as {
      plan_id: string;
      date_from: string;
      date_to: string;
      theme?: string;
      hooks?: { name: string; description?: string }[];
      accounts?: { account_name: string; persona_name?: string; positioning?: string }[];
    };
    if (!date_from || !date_to) {
      return NextResponse.json({ error: "date_from, date_to required" }, { status: 400 });
    }
    if (!anthropic.apiKey) {
      return NextResponse.json({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }, { status: 503 });
    }

    let brandContent = "";
    const { data: autoCats } = await supabase.from("doc_categories").select("id").eq("is_auto_include", true);
    const catIds = (autoCats ?? []).map((c) => c.id);
    if (catIds.length > 0) {
      const { data: docs } = await supabase.from("docs").select("title, content").in("category_id", catIds);
      brandContent = (docs ?? []).map((d) => `【${d.title}】\n${(d.content ?? "").slice(0, 300)}`).join("\n\n");
    }

    const hasStrategy = theme || hooks.length > 0 || accounts.length > 0;
    let contextBlock = "";
    if (hasStrategy) {
      contextBlock = `主题：${theme || "无"}
钩子：${JSON.stringify(hooks)}
账号：${JSON.stringify(accounts)}`;
    } else {
      contextBlock = "无策略，自由排期。";
    }

    const systemPrompt = `你是纽约租房内容策略师。根据以下信息生成内容排期。

${contextBlock}

通用规则：
1. 所有内容围绕租房，不做买房
2. 默认素材混剪视频
3. 不同账号错开发布日期
4. 服务于品牌曝光、权威感、租房咨询
5. 日期范围：${date_from} 到 ${date_to}
6. 每个账号在该范围内安排 2-3 条内容；如果没有账号体系，按日期均匀分布内容

${brandContent ? `品牌资料：\n${brandContent.slice(0, 2000)}\n` : ""}

只返回 JSON 数组，不要其他文字：
[{
  "account_name": "账号名或空",
  "publish_date": "YYYY-MM-DD",
  "title_direction": "标题方向",
  "brief": "一句话内容简述",
  "property_name": "楼盘名或空",
  "content_type": "视频",
  "video_format": "素材混剪"
}]`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: "生成排期" }],
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    const items = jsonMatch ? (JSON.parse(jsonMatch[0]) as Record<string, string>[]) : [];
    const normalized = items.map((it) => ({
      account_name: it.account_name ?? "",
      publish_date: it.publish_date ?? date_from,
      title_direction: it.title_direction ?? "",
      brief: it.brief ?? "",
      property_name: it.property_name ?? "",
      content_type: it.content_type ?? "视频",
      video_format: it.video_format ?? "素材混剪",
    }));

    if (!plan_id) return NextResponse.json({ items: normalized });

    const plan = await supabase.from("content_plans").select("id").eq("id", plan_id).single();
    if (!plan.data) return NextResponse.json({ items: normalized });

    const { data: existingAccounts } = await supabase.from("plan_accounts").select("id, account_name").eq("plan_id", plan_id);
    const accountNameToId = new Map((existingAccounts ?? []).map((a) => [a.account_name, a.id]));

    const toInsert = normalized.map((it, i) => ({
      plan_id,
      account_id: accountNameToId.get(it.account_name) ?? null,
      publish_date: it.publish_date,
      task_template_doc_id: null,
      brand_doc_ids: [],
      title: it.title_direction,
      brief: it.brief,
      property_name: it.property_name || null,
      content_type: it.content_type,
      video_format: it.video_format,
      status: "idea",
      sort_order: i,
    }));

    const { data: inserted } = await supabase.from("content_items").insert(toInsert).select();
    return NextResponse.json({ items: inserted ?? toInsert });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "排期生成失败" }, { status: 500 });
  }
}
