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
    name: "search_property",
    description: "按楼盘名称搜索，返回楼盘基本信息、关联开发商公司、联系人和外联（outreach）状态。用户问某楼盘信息时优先用此工具。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "楼盘名称或关键词，如 The Journal、Sable、Park 23 等" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_company",
    description: "按公司（开发商/管理公司）名称搜索，返回公司信息和联系人。用户问某开发商/管理公司时用此工具。",
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

    case "search_property": {
      const q = String(input.query ?? "").trim();
      // 搜楼盘名
      const { data: props } = await supabase
        .from("properties")
        .select("id, name, address, city, area, units, build_year, price_range")
        .ilike("name", `%${q}%`)
        .limit(5);
      if (!props?.length) return { found: false, properties: [] };

      const propertyIds = props.map((p: { id: string }) => p.id);

      // 关联公司 + 联系人
      const { data: pcs } = await supabase
        .from("property_companies")
        .select("property_id, role, companies(id, name, email, phone, contacts(id, name, title, email, phone))")
        .in("property_id", propertyIds);

      // 外联状态
      const { data: outreachRows } = await supabase
        .from("outreach")
        .select("property_id, stage, deal_status, contact_name, contact_info, notes, needs_attention, updated_at")
        .in("property_id", propertyIds)
        .order("updated_at", { ascending: false });

      const outreachByPropertyId: Record<string, unknown[]> = {};
      for (const row of (outreachRows ?? [])) {
        const pid = (row as { property_id: string }).property_id;
        if (!outreachByPropertyId[pid]) outreachByPropertyId[pid] = [];
        outreachByPropertyId[pid].push(row);
      }

      const pcsByPropertyId: Record<string, unknown[]> = {};
      for (const pc of (pcs ?? [])) {
        const pid = (pc as { property_id: string }).property_id;
        if (!pcsByPropertyId[pid]) pcsByPropertyId[pid] = [];
        pcsByPropertyId[pid].push(pc);
      }

      const result = props.map((p: { id: string; name: string; address: string | null; city: string | null; area: string | null; units: number | null; build_year: number | null; price_range: string | null }) => ({
        ...p,
        companies: pcsByPropertyId[p.id] ?? [],
        outreach: outreachByPropertyId[p.id] ?? [],
      }));

      return { found: true, properties: result };
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
      // outreach 按 property_id 关联，需先找该公司的楼盘
      const { data: pcs } = await supabase
        .from("property_companies")
        .select("property_id, properties(id, name)")
        .eq("company_id", input.company_id);
      const propertyIds = (pcs ?? []).map((pc: { property_id: string }) => pc.property_id).filter(Boolean);
      if (propertyIds.length === 0) return { outreach: [], properties: [] };
      const { data: outreachRows } = await supabase
        .from("outreach")
        .select("*, properties(name)")
        .in("property_id", propertyIds)
        .order("updated_at", { ascending: false })
        .limit(20);
      return {
        properties: (pcs ?? []).map((pc: { property_id: string; properties: unknown }) => pc.properties),
        outreach: outreachRows ?? [],
      };
    }

    case "search_knowledge": {
      const q = String((input.query as string) || "").trim();
      if (!q) return { docs: [] };
      const { data: docs } = await supabase
        .from("docs")
        .select("id, title, content, category_id, tags, metadata")
        .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
        .limit(10);
      const categoryIds = Array.from(new Set((docs ?? []).map((d) => d.category_id)));
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
      const categoryIds = Array.from(new Set((docs ?? []).map((d) => d.category_id)));
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

const CHAT_SYSTEM_PROMPT = `你是 GenNext 的中央 AI 助手，服务于一个纽约地产营销团队。和用户说话要像关系不错的同事在微信里打字：自然、有人情味、好扫一眼能懂，不要像维基百科、说明书或报告标题。

你可以：
- 查询今日日程和待办事项
- 查询楼盘（property）信息、关联开发商和外联状态
- 查询开发商/管理公司信息和联系人
- 搜索档案库，生成文案内容
- 获取最新新闻和KPI数据

工具选择原则（重要）：
- 用户问「XXX 楼盘」「XXX 的信息」「XXX outreach 状态」→ 用 search_property
- 用户问某家开发商/管理公司 → 用 search_company
- 不确定是楼盘还是公司时 → 先用 search_property，没结果再用 search_company

输出格式（务必遵守）：
- 用户在窄聊天框里看回复。【禁止 Markdown】：不要用 # 标题、不要用 ** 或 __ 加粗、不要用标准 Markdown 列表（-, *, 1. 叠很多层）。如需分句，用空行分段；偶尔用「·」或「一是」这种口语列举即可。
- 不要输出 \`\`\` 代码块；强调就用「」或引号包住词，直接把重点写进句子里。
- 讲楼盘、外联时可以用两三段短话：先一句接话（比如「这条我刚对了一下库里——」），再信息点，最后有需要再补一句建议或下一步。

工作原则：
- 先用工具查询相关数据，再给出回答
- 生成文案时，主动搜索相关档案库和模板
- 中文为主，该简短就简短
- 如果需要生成文案，直接输出内容本身（同样不要包一层 Markdown）
- 多步骤任务时，逐步完成，不要一次性要求用户提供所有信息`;

type ChatBody = {
  message?: string;
  conversation_history?: Anthropic.MessageParam[];
  /** 默认 true：SSE 流式输出。传 false 时返回 JSON { reply }（兼容旧客户端） */
  stream?: boolean;
};

function buildChatMessages(body: ChatBody): Anthropic.MessageParam[] {
  const message = String(body.message ?? "").trim();
  const history = Array.isArray(body.conversation_history) ? body.conversation_history : [];
  return [...history, { role: "user" as const, content: message }];
}

async function runOneTurnNonStreaming(
  currentMessages: Anthropic.MessageParam[]
): Promise<
  | { kind: "text"; text: string }
  | { kind: "tool"; assistantContent: Anthropic.ContentBlock[]; toolResults: Anthropic.ToolResultBlockParam[] }
> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: CHAT_SYSTEM_PROMPT,
    tools,
    messages: currentMessages,
  });

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
    return { kind: "tool", assistantContent: response.content, toolResults };
  }

  const text =
    response.stop_reason === "end_turn"
      ? response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
      : response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

  return { kind: "text", text };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatBody;
  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "缺少 message", success: false }, { status: 400 });
  }

  const useSse = body.stream !== false;

  if (!useSse) {
    try {
      let currentMessages = buildChatMessages(body);
      let finalText = "";
      const maxIterations = 5;
      for (let iterations = 0; iterations < maxIterations; iterations++) {
        const turn = await runOneTurnNonStreaming(currentMessages);
        if (turn.kind === "text") {
          finalText = turn.text;
          break;
        }
        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: turn.assistantContent },
          { role: "user" as const, content: turn.toolResults },
        ];
      }
      return NextResponse.json({ reply: finalText, success: true });
    } catch (error) {
      console.error("AI Chat error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error), success: false },
        { status: 500 }
      );
    }
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        let currentMessages = buildChatMessages(body);
        const maxIterations = 5;

        for (let iterations = 0; iterations < maxIterations; iterations++) {
          const msgStream = anthropic.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            system: CHAT_SYSTEM_PROMPT,
            tools,
            messages: currentMessages,
          });

          msgStream.on("text", (delta) => {
            send({ type: "delta", text: delta });
          });

          const finalMsg = await msgStream.finalMessage();

          if (finalMsg.stop_reason === "tool_use") {
            const toolUseBlocks = finalMsg.content.filter(
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
              { role: "assistant" as const, content: finalMsg.content },
              { role: "user" as const, content: toolResults },
            ];
            continue;
          }

          send({ type: "done", success: true });
          controller.close();
          return;
        }

        send({
          type: "error",
          message: "工具调用次数过多，请缩短问题或稍后重试",
          success: false,
        });
        controller.close();
      } catch (error) {
        console.error("AI Chat stream error:", error);
        send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          success: false,
        });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
