import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

const tools: Anthropic.Tool[] = [
  {
    name: "get_today_schedule",
    description: "获取今日和未来7天的日历事项",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_todos",
    description: "获取所有未完成的待办事项",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "search_company",
    description: "在CRM中搜索公司信息，包括联系人和最近沟通记录",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "公司名称或关键词" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_company_logs",
    description: "获取某个公司的完整沟通记录（外联追踪）",
    input_schema: {
      type: "object" as const,
      properties: {
        company_id: { type: "string", description: "公司ID" },
      },
      required: ["company_id"],
    },
  },
  {
    name: "search_knowledge",
    description: "搜索档案库，包括品牌档案、知识库文档",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "搜索关键词，如楼盘名称、主题" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_templates",
    description: "获取任务模板和人格模板",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          description: "平台类型：xiaohongshu/instagram/linkedin/wechat/all",
          enum: ["xiaohongshu", "instagram", "linkedin", "wechat", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_latest_news",
    description: "获取最新新闻摘要",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "条数，默认5" },
      },
      required: [],
    },
  },
  {
    name: "get_kpi_summary",
    description: "获取本周KPI数据概况",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "generate_copy",
    description: "根据档案库文档生成文案内容。先通过 search_knowledge 和 get_templates 获取文档 id，再传入 doc_ids",
    input_schema: {
      type: "object" as const,
      properties: {
        doc_ids: {
          type: "array",
          items: { type: "string" },
          description: "文档ID列表（来自 search_knowledge 或 get_templates）",
        },
        user_request: { type: "string", description: "用户的具体需求描述" },
      },
      required: ["user_request"],
    },
  },
];

type ToolInput = Record<string, string | number | string[] | undefined>;

async function executeTool(name: string, input: ToolInput): Promise<unknown> {
  switch (name) {
    case "get_today_schedule": {
      const today = new Date();
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const todayStr = fmt(today);
      const nextWeek = new Date(today.getTime() + 7 * 86400000);
      const nextWeekStr = fmt(nextWeek);

      const { data } = await supabase.rpc("get_calendar_by_date_range", {
        start_date: todayStr,
        end_date: nextWeekStr,
      });
      return data || [];
    }

    case "get_todos": {
      const { data } = await supabase
        .from("todos")
        .select("*")
        .eq("done", false)
        .order("created_at", { ascending: false });
      return data || [];
    }

    case "search_company": {
      const { data } = await supabase
        .from("companies")
        .select("*, contacts(*)")
        .ilike("name", `%${input.query}%`)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    }

    case "get_company_logs": {
      const { data } = await supabase
        .from("outreach")
        .select("*")
        .eq("company_id", input.company_id)
        .order("updated_at", { ascending: false })
        .limit(10);
      return data || [];
    }

    case "search_knowledge": {
      const q = String((input.query as string) || "").trim();
      if (!q) return { docs: [] };
      const { data: docs } = await supabase
        .from("docs")
        .select("id, title, content, category_id, tags, metadata")
        .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
        .limit(10);
      const categoryIds = [...new Set((docs ?? []).map((d) => d.category_id))];
      const { data: categories } = await supabase
        .from("doc_categories")
        .select("id, name")
        .in("id", categoryIds);
      const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]));
      const docsWithCategory = (docs ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        category_name: catMap.get(d.category_id) ?? "",
        tags: d.tags,
      }));
      return { docs: docsWithCategory };
    }

    case "get_templates": {
      const { data: categories } = await supabase
        .from("doc_categories")
        .select("id, name")
        .in("name", ["任务模板", "人格模板"]);
      const categoryIds = (categories ?? []).map((c) => c.id);
      if (categoryIds.length === 0) return { task_docs: [], persona_docs: [] };
      const { data: docs } = await supabase
        .from("docs")
        .select("id, title, content, category_id, metadata")
        .in("category_id", categoryIds);
      const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]));
      const taskDocs = (docs ?? []).filter((d) => catMap.get(d.category_id) === "任务模板");
      const personaDocs = (docs ?? []).filter((d) => catMap.get(d.category_id) === "人格模板");
      const platform = input.platform || "all";
      const filteredTask =
        platform === "all"
          ? taskDocs
          : taskDocs.filter((d) => (d.metadata as { platform?: string })?.platform === platform);
      return {
        task_templates: filteredTask,
        persona_templates: personaDocs,
      };
    }

    case "get_latest_news": {
      const limit = Number(input.limit) || 5;
      const { data } = await supabase
        .from("news_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      return data || [];
    }

    case "get_kpi_summary": {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from("xhs_post_metrics_snapshots")
        .select("snapshot_date, exposure, views, likes, comments, collects, shares")
        .gte("snapshot_date", weekAgo.slice(0, 10))
        .order("snapshot_date", { ascending: false })
        .limit(50);
      return data || [];
    }

    case "generate_copy": {
      const docIds = Array.isArray(input.doc_ids) ? input.doc_ids : [];
      const userRequest = String(input.user_request ?? "");
      if (docIds.length === 0) {
        const parts: string[] = ["用户需求："];
        parts.push(userRequest || "无");
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: parts.join("\n") }],
        });
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text"
        );
        return textBlock?.text ?? "";
      }
      const { data: docs } = await supabase
        .from("docs")
        .select("id, title, content, category_id")
        .in("id", docIds);
      const categoryIds = [...new Set((docs ?? []).map((d) => d.category_id))];
      const { data: categories } = await supabase
        .from("doc_categories")
        .select("id, name, is_auto_include")
        .in("id", categoryIds);
      const catMap = new Map((categories ?? []).map((c) => [c.id, { name: c.name, is_auto_include: c.is_auto_include }]));
      const autoInclude = (categories ?? []).filter((c) => c.is_auto_include).map((c) => c.id);
      const parts: string[] = [];
      const autoDocs = (docs ?? []).filter((d) => autoInclude.includes(d.category_id));
      const otherDocs = (docs ?? []).filter((d) => !autoInclude.includes(d.category_id));
      if (autoDocs.length) {
        parts.push(
          "品牌规范与必读：\n" +
            autoDocs
              .map(
                (d) =>
                  `【${(catMap.get(d.category_id) as { name: string })?.name ?? ""} · ${d.title}】\n${d.content ?? ""}`
              )
              .join("\n\n")
        );
      }
      if (otherDocs.length) {
        parts.push(
          "参考资料：\n" +
            otherDocs
              .map(
                (d) =>
                  `【${(catMap.get(d.category_id) as { name: string })?.name ?? ""} · ${d.title}】\n${d.content ?? ""}`
              )
              .join("\n\n")
        );
      }
      parts.push(`用户需求：${userRequest || "无"}`);
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: parts.join("\n\n") }],
      });
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return textBlock?.text ?? "";
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, conversation_history = [] } = await req.json();

    const messages: Anthropic.MessageParam[] = [
      ...conversation_history,
      { role: "user" as const, content: message },
    ];

    const systemPrompt = `你是 Ops Hub 的中央 AI 助手，服务于一个纽约地产营销团队。

你可以：
- 查询今日日程和待办事项
- 在CRM中查找公司信息，帮写跟进消息
- 搜索档案库，生成文案内容
- 获取最新新闻和KPI数据

工作原则：
- 先用工具查询相关数据，再给出回答
- 生成文案时，主动搜索相关档案库和模板
- 回答简洁直接，中文为主
- 如果需要生成文案，直接输出内容
- 多步骤任务时，逐步完成，不要一次性要求用户提供所有信息`;

    let currentMessages = messages;
    let finalText = "";
    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
      iterations++;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      });

      if (response.stop_reason === "end_turn") {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          toolUseBlocks.map(async (block) => {
            console.log(`[AI Tool] 调用: ${block.name}`, block.input);
            const result = await executeTool(block.name, block.input as ToolInput);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          })
        );

        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: response.content },
          { role: "user" as const, content: toolResults },
        ];
        continue;
      }

      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      break;
    }

    return NextResponse.json({ reply: finalText, success: true });
  } catch (error) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: String(error), success: false },
      { status: 500 }
    );
  }
}
