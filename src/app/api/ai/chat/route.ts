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
    description: "根据档案库和模板生成文案内容",
    input_schema: {
      type: "object" as const,
      properties: {
        brand_doc_ids: {
          type: "array",
          items: { type: "string" },
          description: "品牌档案ID列表",
        },
        knowledge_doc_ids: {
          type: "array",
          items: { type: "string" },
          description: "知识库文档ID列表",
        },
        task_template_id: { type: "string", description: "任务模板ID" },
        persona_template_id: { type: "string", description: "人格模板ID" },
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
      const [brand, knowledge] = await Promise.all([
        supabase
          .from("brand_docs")
          .select("id, title, content, property_name, tags")
          .or(
            `title.ilike.%${input.query}%,content.ilike.%${input.query}%,property_name.ilike.%${input.query}%`
          )
          .limit(5),
        supabase
          .from("knowledge_docs")
          .select("id, title, content, type, tags")
          .or(`title.ilike.%${input.query}%,content.ilike.%${input.query}%`)
          .limit(5),
      ]);
      return {
        brand_docs: brand.data || [],
        knowledge_docs: knowledge.data || [],
      };
    }

    case "get_templates": {
      const platform = input.platform || "all";
      let taskQuery = supabase.from("task_templates").select("*");
      if (platform !== "all") taskQuery = taskQuery.eq("platform", platform);
      const [tasks, personas] = await Promise.all([
        taskQuery,
        supabase.from("persona_templates").select("*"),
      ]);
      return {
        task_templates: tasks.data || [],
        persona_templates: personas.data || [],
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
      const brandIds = Array.isArray(input.brand_doc_ids) ? input.brand_doc_ids : [];
      const knowledgeIds = Array.isArray(input.knowledge_doc_ids) ? input.knowledge_doc_ids : [];
      const taskId = typeof input.task_template_id === "string" ? input.task_template_id : null;
      const personaId = typeof input.persona_template_id === "string" ? input.persona_template_id : null;
      const userRequest = String(input.user_request ?? "");

      const [brandDocs, knowledgeDocs, taskTemplate, personaTemplate] =
        await Promise.all([
          brandIds.length
            ? supabase
                .from("brand_docs")
                .select("title, content")
                .in("id", brandIds)
            : supabase
                .from("brand_docs")
                .select("title, content")
                .eq("is_global", true),
          knowledgeIds.length
            ? supabase
                .from("knowledge_docs")
                .select("title, content")
                .in("id", knowledgeIds)
            : Promise.resolve({ data: [] as { title: string; content: string }[] }),
          taskId
            ? supabase
                .from("task_templates")
                .select("title, content")
                .eq("id", taskId)
                .single()
            : supabase
                .from("task_templates")
                .select("title, content")
                .eq("is_default", true)
                .limit(1)
                .single(),
          personaId
            ? supabase
                .from("persona_templates")
                .select("title, content")
                .eq("id", personaId)
                .single()
            : supabase
                .from("persona_templates")
                .select("title, content")
                .eq("is_default", true)
                .limit(1)
                .single(),
        ]);

      const parts: string[] = [];
      if (brandDocs.data?.length) {
        parts.push(
          brandDocs.data
            .map(
              (d: { title: string; content: string | null }) =>
                `【品牌档案：${d.title}】\n${d.content ?? ""}`
            )
            .join("\n\n")
        );
      }
      if (knowledgeDocs.data?.length) {
        parts.push(
          `参考资料：\n${(knowledgeDocs.data as { title: string; content: string | null }[])
            .map((d) => `【${d.title}】\n${d.content ?? ""}`)
            .join("\n\n")}`
        );
      }
      if (taskTemplate.data) {
        parts.push(`任务要求：\n${(taskTemplate.data as { content: string | null }).content ?? ""}`);
      }
      if (personaTemplate.data) {
        parts.push(`人格设定：\n${(personaTemplate.data as { content: string | null }).content ?? ""}`);
      }
      parts.push(`用户需求：${userRequest}`);

      const prompt = parts.join("\n\n");
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
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
