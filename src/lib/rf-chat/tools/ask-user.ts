import { ok, type Tool } from "../types";

type Option = { id: string; label: string; hint?: string };
type Input = {
  question?: string;
  options?: Option[];
};

/**
 * ask_user 是 first-class 澄清工具。
 *
 * - AI 调用它 = 正式向用户追问（前端会把 options 渲染成可点按钮）。
 * - 调用后**终止本轮 tool 循环**——流会立刻发 `type:"ask_user"` 事件给前端。
 *   用户点/打字回复后作为新的 user message 再发一轮。
 *
 * 结果是副作用（前端渲染），返回值对 AI 没有实际用途。
 */
export const askUserTool: Tool<Input> = {
  name: "ask_user",
  description:
    "向用户结构化追问。**什么时候用**：有 candidates 需要挑选时；参数缺失需要确认时；有多种可能的执行路径时。传 `question` 和 `options`（每个 option 有 id/label，可选 hint）。调用本工具会立刻结束这一轮，等用户选完再接着回答——所以调完不要再调其它工具。",
  input_schema: {
    type: "object" as const,
    properties: {
      question: { type: "string", description: "问用户的话" },
      options: {
        type: "array",
        description: "候选项。每项 {id, label, hint?}。",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            hint: { type: "string" },
          },
          required: ["id", "label"],
        },
      },
    },
    required: ["question"],
  },
  terminatesLoop: true,
  async execute(input) {
    return ok({
      question: (input.question ?? "").trim() || "请选一个？",
      options: Array.isArray(input.options) ? input.options : [],
    });
  },
};
