/**
 * Claude API 封装，支持流式输出
 */

export interface StreamMessage {
  type: "text_delta";
  text: string;
}

export async function streamClaudeChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (text: string) => void,
  options?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    system?: string;
  }
): Promise<void> {
  const apiKey =
    options?.apiKey ??
    process.env.CLAUDE_API_KEY ??
    process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    console.error("[claude] 未找到 API Key，请设置 CLAUDE_API_KEY 或 ANTHROPIC_API_KEY");
    throw new Error("CLAUDE_API_KEY 或 ANTHROPIC_API_KEY 未设置");
  }
  console.log("[claude] 使用 API Key 前缀:", apiKey.slice(0, 8) + "...");

  const model = options?.model ?? "claude-sonnet-4-20250514";
  const maxTokens = options?.maxTokens ?? 4096;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content,
    })),
    stream: true,
  };
  if (options?.system) body.system = options.system;

  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("[claude] API 错误:", response.status, err);
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    console.error("[claude] 无 response.body");
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let firstChunk = true;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const jsonStr = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.type === "content_block_delta" && parsed.delta) {
          const text = parsed.delta.type === "text_delta" ? parsed.delta.text : parsed.delta.text ?? parsed.delta;
          const chunk = typeof text === "string" ? text : "";
          if (chunk) {
            if (firstChunk) {
              console.log("[claude] 第一个 content_block_delta chunk:", JSON.stringify(chunk.slice(0, 80)));
              firstChunk = false;
            }
            onChunk(chunk);
          }
        } else if (parsed.type && parsed.type !== "message_start" && parsed.type !== "content_block_start" && parsed.type !== "message_delta" && parsed.type !== "message_stop" && parsed.type !== "content_block_stop" && parsed.type !== "ping") {
          console.log("[claude] 其他 event type:", parsed.type);
        }
      } catch (parseErr) {
        if (trimmed.startsWith("data:") || jsonStr.startsWith("{")) {
          console.warn("[claude] 解析行失败:", trimmed.slice(0, 80), parseErr);
        }
      }
    }
  }
}
