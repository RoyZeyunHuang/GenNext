import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { contactFirstName } from "@/lib/email-helpers";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

async function fetchAutoIncludeBrandDocs(): Promise<string> {
  const { data: cats } = await supabase
    .from("doc_categories")
    .select("id")
    .eq("is_auto_include", true);
  if (!cats?.length) return "";
  const ids = cats.map((c) => c.id);
  const { data: docs } = await supabase
    .from("docs")
    .select("title, content")
    .in("category_id", ids);
  if (!docs?.length) return "";
  return docs
    .map((d) => `【${d.title}】\n${(d.content ?? "").slice(0, 4000)}`)
    .join("\n\n");
}

async function fetchLatestOutreachStage(propertyId: string): Promise<string> {
  const { data } = await supabase
    .from("outreach")
    .select("stage")
    .eq("property_id", propertyId)
    .order("updated_at", { ascending: false })
    .limit(1);

  return (data?.[0] as { stage?: string } | undefined)?.stage ?? "Not Started";
}

async function fetchEmailHistorySummaries(companyId: string, propertyId: string): Promise<string> {
  const { data } = await supabase
    .from("emails")
    .select("direction, subject, ai_summary, body, created_at")
    .eq("company_id", companyId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!data?.length) return "无";

  return data
    .map((r) => {
      const dir = (r.direction ?? "unknown") as string;
      const ai = (r.ai_summary ?? "") as string;
      const sub = (r.subject ?? "") as string;
      const fallbackBody = ((r.body ?? "") as string).slice(0, 120);
      const summary = ai?.trim() ? ai.trim() : fallbackBody;
      return `${dir} · ${sub}：${summary}`;
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    if (!anthropic.apiKey) {
      return NextResponse.json(
        { error: "未配置 ANTHROPIC_API_KEY / CLAUDE_API_KEY" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      property_selections?: Array<{
        property_id: string;
        property_name: string;
        address?: string | null;
        area?: string | null;
        build_year?: number | null;
        units?: number | null;
        company_id: string;
        company_name: string;
        company_role?: string | null;
        contact_name?: string | null;
        to_email?: string | null;
        outreach_stage?: string | null;
        selection_key?: string | null;
      }>;
    };

    const propertySelections = body.property_selections ?? [];
    if (!Array.isArray(propertySelections) || propertySelections.length === 0) {
      return NextResponse.json(
        { error: "property_selections 必填" },
        { status: 400 }
      );
    }

    const brandDocs = await fetchAutoIncludeBrandDocs();

    const results: Array<{
      property_id: string;
      property_name: string;
      company_id: string;
      company_name: string;
      company_role?: string | null;
      selection_key?: string | null;
      to_email: string | null;
      subject: string;
      body: string;
      error?: string;
    }> = [];

    for (const sel of propertySelections) {
      const propertyId = sel.property_id;
      const companyId = sel.company_id;
      const toEmail = sel.to_email ?? null;

      if (!propertyId || !companyId) {
        results.push({
          property_id: propertyId ?? "",
          property_name: sel.property_name ?? "",
          company_id: companyId ?? "",
          company_name: sel.company_name ?? "",
          company_role: sel.company_role ?? null,
          selection_key: sel.selection_key ?? null,
          to_email: toEmail,
          subject: "",
          body: "",
          error: "property_id / company_id 缺失",
        });
        continue;
      }

      if (!toEmail || !toEmail.trim()) {
        results.push({
          property_id: propertyId,
          property_name: sel.property_name ?? "",
          company_id: companyId,
          company_name: sel.company_name ?? "",
          company_role: sel.company_role ?? null,
          selection_key: sel.selection_key ?? null,
          to_email: null,
          subject: "",
          body: "",
          error: "没有收件邮箱",
        });
        continue;
      }

      const stage = (sel.outreach_stage ?? null) || (await fetchLatestOutreachStage(propertyId));
      const historySummaries = await fetchEmailHistorySummaries(companyId, propertyId);

      const companyRole = (sel.company_role ?? "").trim().toLowerCase();
      const hiName = sel.contact_name?.trim()
        ? contactFirstName(sel.contact_name)
        : contactFirstName(sel.company_name ?? null, "there");
      const propertyBlock = `${sel.property_name ?? ""}${sel.area ? `（${sel.area}）` : ""}${
        sel.address ? `｜${sel.address}` : ""
      }\nBuild Year：${sel.build_year ?? "—"}｜Units：${sel.units ?? "—"}`;

      const roleInstruction = (() => {
        switch (companyRole) {
          case "developer":
            return "语气重点：以开发/营销合作推广该楼盘为主，强调联合推广、曝光与项目亮点，并提出明确的下一步跟进（电话/会面）。";
          case "management":
            return "语气重点：以租赁与管理端的合作推广为主，强调带看/成交转化、合规与运营支持，并提出明确的下一步跟进（电话/会面）。";
          case "leasing":
            return "语气重点：以带客/成交合作为主，强调客户资源、看房安排与成交路径，并提出明确的下一步跟进（电话/会面）。";
          case "marketing":
            return "语气重点：以市场推广合作为主，强调渠道联动、内容/活动协作，并提出明确的下一步跟进（电话/会面）。";
          default:
            return "语气重点：保持专业自然的商务合作 pitch，内容贴合公司角色，并提出明确的下一步跟进（电话/会面）。";
        }
      })();

      const userBlock = `你是纽约地产公司 BD 专员。为以下楼盘与关联公司生成一封合作 pitch email（英文）。

楼盘信息：
${propertyBlock}

关联公司：
${sel.company_name ?? ""}（角色：${sel.company_role ?? ""}）

联系人（称呼用名）：${sel.contact_name?.trim() ? contactFirstName(sel.contact_name) : ""}
收件邮箱：${toEmail}

当前 BD 阶段：${stage}
历史邮件摘要（来自 emails.ai_summary）：
${historySummaries}

品牌资料：
${brandDocs || "（无）"}

要求：
- 专业自然，英文，不超过 150 words
- 用 Hi + ${hiName} 开头，不用 Dear
- 结尾明确 call to action（电话/会议）
- ${roleInstruction}
- 只返回一个 JSON 对象，不要 markdown：{"subject":"...","body":"..."}`;

      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: `你是一个纽约地产公司的 BD 专员，负责给开发商/管理公司发合作邮件。你必须严格按要求输出 JSON。不要写签名，不要写 Best regards 或 Sincerely，系统会自动添加签名。`,
          messages: [{ role: "user", content: userBlock }],
        });

        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("AI 未返回 JSON");
        const parsed = JSON.parse(m[0]) as {
          subject?: string;
          body?: string;
        };

        results.push({
          property_id: propertyId,
          property_name: sel.property_name ?? "",
          company_id: companyId,
          company_name: sel.company_name ?? "",
          company_role: sel.company_role ?? null,
          selection_key: sel.selection_key ?? null,
          to_email: toEmail,
          subject: parsed.subject ?? "Partnership opportunity",
          body: parsed.body ?? "",
        });
      } catch (e) {
        results.push({
          property_id: propertyId,
          property_name: sel.property_name ?? "",
          company_id: companyId,
          company_name: sel.company_name ?? "",
          company_role: sel.company_role ?? null,
          selection_key: sel.selection_key ?? null,
          to_email: toEmail,
          subject: "",
          body: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
