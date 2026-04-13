import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import {
  maxTokensForBodyStream,
  normalizeArticleLength,
  normalizePersonaIntensity,
} from "@/lib/copy-generate-options";
import {
  buildSystemPrompt,
  FULL_OUTPUT_TOOL,
  TITLE_OUTPUT_TOOL,
  type PromptDoc,
} from "@/lib/prompt-templates";
import { supabase } from "@/lib/supabase";
import { GNN_TITLES_MARKER } from "@/lib/copy-stream-titles";
import {
  logAnthropicInputUsage,
  usageMetaHeaders,
} from "@/lib/anthropic-usage-log";
import { isTitlePatternCategoryRow, resolvePromptDocRole } from "@/lib/doc-category-constants";
import { formatAiErrorForUser } from "@/lib/ai-user-facing-error";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type GenerationPhase = "titles" | "body" | "full";

async function loadPromptDocs(allDocIds: string[]): Promise<{
  promptDocs: PromptDoc[];
  enableWebSearch: boolean;
}> {
  if (allDocIds.length === 0) {
    return { promptDocs: [], enableWebSearch: false };
  }

  const { data: docs } = await supabase
    .from("docs")
    .select("id, title, content, category_id, role, priority")
    .in("id", allDocIds);

  const { data: categories } = await supabase.from("doc_categories").select("id, name");
  const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const promptDocs: PromptDoc[] = (docs ?? []).map((d) => {
    const categoryName = catMap.get(d.category_id) ?? "";
    return {
      id: d.id,
      title: d.title,
      content: d.content,
      category_name: categoryName,
      role: resolvePromptDocRole(categoryName, d.role as string | null | undefined),
      priority: typeof d.priority === "number" ? d.priority : 3,
    };
  });

  const enableWebSearch = (docs ?? []).some(
    (d) =>
      (d.content ?? "").includes("联网搜索") ||
      (d.title ?? "").includes("联网搜索")
  );

  return { promptDocs, enableWebSearch };
}

async function loadTitlePatternContent(titlePatternDocId: string | null): Promise<string | null> {
  if (!titlePatternDocId) return null;

  const { data: tpDoc } = await supabase
    .from("docs")
    .select("id, content, category_id")
    .eq("id", titlePatternDocId)
    .maybeSingle();

  if (!tpDoc?.category_id) return null;

  const { data: cat } = await supabase
    .from("doc_categories")
    .select("id, name, sort_order")
    .eq("id", tpDoc.category_id)
    .maybeSingle();

  if (cat && isTitlePatternCategoryRow(cat) && (tpDoc.content ?? "").trim()) {
    return (tpDoc.content ?? "").trim();
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      selected_doc_ids = [],
      user_input = "",
      title_pattern_doc_id: titlePatternDocIdRaw = null,
      article_length: articleLengthRaw,
      persona_intensity: personaIntensityRaw,
      phase: phaseRaw = "full",
      selected_title: selectedTitleRaw = "",
      body_text: bodyTextRaw = "",
    } = body as {
      selected_doc_ids?: string[];
      user_input?: string;
      title_pattern_doc_id?: string | null;
      article_length?: string;
      persona_intensity?: number | string;
      phase?: string;
      selected_title?: string;
      /** 先正文后标题：生成标题时传入已写正文 */
      body_text?: string;
    };

    const phase: GenerationPhase =
      phaseRaw === "titles" || phaseRaw === "body" || phaseRaw === "full" ? phaseRaw : "full";

    const allDocIds = (Array.isArray(selected_doc_ids) ? selected_doc_ids : []).filter(Boolean);
    const titlePatternDocId =
      typeof titlePatternDocIdRaw === "string" && titlePatternDocIdRaw.trim()
        ? titlePatternDocIdRaw.trim()
        : null;
    const articleLength = normalizeArticleLength(articleLengthRaw);
    const personaIntensity = normalizePersonaIntensity(personaIntensityRaw);
    const selectedTitle =
      typeof selectedTitleRaw === "string" ? selectedTitleRaw.trim() : "";
    const bodyTextForTitles =
      typeof bodyTextRaw === "string" ? bodyTextRaw.trim() : "";
    const userInputTrimmed = typeof user_input === "string" ? user_input.trim() : "";

    if (!anthropic.apiKey) {
      return new Response(
        JSON.stringify({ error: "未设置 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const { promptDocs, enableWebSearch } = await loadPromptDocs(allDocIds);
    const titlePatternContent = await loadTitlePatternContent(titlePatternDocId);
    const useFullStructuredTool = !!titlePatternContent;

    const userBase = `=== 用户需求 ===\n${user_input || "无具体需求"}`;
    const userMessageForBody =
      phase === "body" && selectedTitle
        ? `${userBase}\n\n=== 用户选定标题（请围绕其撰写正文，不要重复该标题行） ===\n${selectedTitle}`
        : userBase;

    const userMessageForTitles =
      `${userBase}\n\n=== 已写正文（请据此生成标题候选） ===\n${bodyTextForTitles || "（空）"}`;

    // ---------- 阶段：据正文生成标题（tool） ----------
    if (phase === "titles") {
      if (!bodyTextForTitles) {
        return new Response(JSON.stringify({ error: "生成标题需要先有正文，请传 body_text" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 标题阶段不附带联网工具：正文已写好，无需再搜；且 tool_choice 固定为 output_titles 时与 web_search 组合会拖慢/重试
      const systemPrompt = buildSystemPrompt({
        docs: promptDocs,
        articleLength,
        personaIntensity,
        titlePatternContent,
        mode: "titles_from_body",
      });

      const tools: Anthropic.Tool[] = [
        {
          name: TITLE_OUTPUT_TOOL.name,
          description: TITLE_OUTPUT_TOOL.description,
          input_schema: TITLE_OUTPUT_TOOL.input_schema,
        } as unknown as Anthropic.Tool,
      ];

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        tool_choice: { type: "tool", name: TITLE_OUTPUT_TOOL.name },
        messages: [{ role: "user", content: userMessageForTitles }],
      });

      logAnthropicInputUsage({
        phase: "titles",
        inputTokens: response.usage?.input_tokens,
        userInputForExclusionEstimate: userInputTrimmed,
      });

      const titleBlock = response.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === "tool_use" && b.name === TITLE_OUTPUT_TOOL.name
      );

      if (titleBlock) {
        const result = titleBlock.input as {
          titles: { type_name: string; text: string }[];
        };
        return new Response(
          JSON.stringify({
            structured: true,
            phase: "titles",
            titles: result.titles,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              ...usageMetaHeaders(response.usage?.input_tokens, userInputTrimmed),
            },
          }
        );
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          ...usageMetaHeaders(response.usage?.input_tokens, userInputTrimmed),
        },
      });
    }

    // ---------- 阶段：仅正文（流式；无 selected_title 时为「正文 + 同次 output_titles」） ----------
    if (phase === "body") {
      const systemPrompt = buildSystemPrompt({
        docs: promptDocs,
        articleLength,
        personaIntensity,
        titlePatternContent,
        mode: selectedTitle ? "body_only" : "body_first",
        selectedTitle: selectedTitle || undefined,
      });

      const encoder = new TextEncoder();

      // 已选标题：只流式正文，不附带标题工具
      if (selectedTitle) {
        const tools: Anthropic.Tool[] = [];
        if (enableWebSearch) {
          tools.push({
            type: "web_search_20250305",
            name: "web_search",
          } as unknown as Anthropic.Tool);
        }

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const response = await anthropic.messages.stream({
                model: "claude-sonnet-4-20250514",
                max_tokens: maxTokensForBodyStream(articleLength, "body_only"),
                system: systemPrompt,
                messages: [{ role: "user", content: userMessageForBody }],
                ...(tools.length > 0 ? { tools } : {}),
              });
              for await (const event of response) {
                if (event.type === "message_start") {
                  logAnthropicInputUsage({
                    phase: "body(body_only)",
                    inputTokens: event.message.usage?.input_tokens,
                    userInputForExclusionEstimate: userInputTrimmed,
                  });
                }
                if (
                  event.type === "content_block_delta" &&
                  event.delta?.type === "text_delta" &&
                  event.delta.text
                ) {
                  controller.enqueue(encoder.encode(event.delta.text));
                }
              }
            } catch (err) {
              controller.enqueue(
                encoder.encode("ERROR: " + formatAiErrorForUser(err))
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-cache",
          },
        });
      }

      // 先正文：流式输出正文，同一次响应中再调用 output_titles，末尾追加标记 + JSON
      const tools: Anthropic.Tool[] = [
        {
          name: TITLE_OUTPUT_TOOL.name,
          description: TITLE_OUTPUT_TOOL.description,
          input_schema: TITLE_OUTPUT_TOOL.input_schema,
        } as unknown as Anthropic.Tool,
      ];
      if (enableWebSearch) {
        tools.unshift({
          type: "web_search_20250305",
          name: "web_search",
        } as unknown as Anthropic.Tool);
      }

      const stream = new ReadableStream({
        async start(controller) {
          let collectingTitles = false;
          let toolInputJson = "";
          try {
            const response = await anthropic.messages.stream({
              model: "claude-sonnet-4-20250514",
              max_tokens: maxTokensForBodyStream(articleLength, "body_first"),
              system: systemPrompt,
              tools,
              tool_choice: { type: "auto" },
              messages: [{ role: "user", content: userMessageForBody }],
            });
            for await (const event of response) {
              if (event.type === "message_start") {
                logAnthropicInputUsage({
                  phase: "body(body_first+titles_tool)",
                  inputTokens: event.message.usage?.input_tokens,
                  userInputForExclusionEstimate: userInputTrimmed,
                });
              }
              if (event.type === "content_block_start") {
                const block = event.content_block;
                if (block.type === "tool_use") {
                  if (block.name === TITLE_OUTPUT_TOOL.name) {
                    collectingTitles = true;
                    toolInputJson = "";
                  } else {
                    collectingTitles = false;
                    toolInputJson = "";
                  }
                }
              }
              if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta" && event.delta.text) {
                  controller.enqueue(encoder.encode(event.delta.text));
                }
                if (
                  event.delta.type === "input_json_delta" &&
                  collectingTitles &&
                  "partial_json" in event.delta
                ) {
                  toolInputJson += event.delta.partial_json;
                }
              }
            }
            if (toolInputJson.trim()) {
              try {
                const parsed = JSON.parse(toolInputJson) as {
                  titles?: { type_name: string; text: string }[];
                };
                if (parsed.titles && parsed.titles.length > 0) {
                  controller.enqueue(
                    encoder.encode(
                      GNN_TITLES_MARKER + JSON.stringify({ titles: parsed.titles })
                    )
                  );
                }
              } catch {
                /* 模型未产出合法 JSON 时由前端回退单独请求 */
              }
            }
          } catch (err) {
            controller.enqueue(
              encoder.encode("ERROR: " + formatAiErrorForUser(err))
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache",
        },
      });
    }

    // ---------- 阶段：full（一步生成，兼容旧行为） ----------
    const systemPrompt = buildSystemPrompt({
      docs: promptDocs,
      articleLength,
      personaIntensity,
      titlePatternContent,
      mode: "full",
    });

    const userMessage = userBase;
    const tools: Anthropic.Tool[] = [];

    if (enableWebSearch) {
      tools.push({
        type: "web_search_20250305",
        name: "web_search",
      } as unknown as Anthropic.Tool);
    }

    if (useFullStructuredTool) {
      tools.push({
        name: FULL_OUTPUT_TOOL.name,
        description: FULL_OUTPUT_TOOL.description,
        input_schema: FULL_OUTPUT_TOOL.input_schema,
      } as unknown as Anthropic.Tool);
    }

    if (useFullStructuredTool && !enableWebSearch) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        tool_choice: { type: "tool", name: FULL_OUTPUT_TOOL.name },
        messages: [{ role: "user", content: userMessage }],
      });

      logAnthropicInputUsage({
        phase: "full(structured_tool)",
        inputTokens: response.usage?.input_tokens,
        userInputForExclusionEstimate: userInputTrimmed,
      });

      const toolBlock = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolBlock) {
        const result = toolBlock.input as {
          titles: { type_name: string; text: string }[];
          body: string;
        };

        return new Response(
          JSON.stringify({
            structured: true,
            titles: result.titles,
            body: result.body,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              ...usageMetaHeaders(response.usage?.input_tokens, userInputTrimmed),
            },
          }
        );
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          ...usageMetaHeaders(response.usage?.input_tokens, userInputTrimmed),
        },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await anthropic.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
            ...(tools.length > 0 ? { tools } : {}),
          });

          for await (const event of response) {
            if (event.type === "message_start") {
              logAnthropicInputUsage({
                phase: "full(stream)",
                inputTokens: event.message.usage?.input_tokens,
                userInputForExclusionEstimate: userInputTrimmed,
              });
            }
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode("ERROR: " + formatAiErrorForUser(err))
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: formatAiErrorForUser(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
