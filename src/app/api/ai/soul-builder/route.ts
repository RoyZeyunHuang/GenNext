import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import {
  SOUL_BOOTSTRAP_USER_MESSAGE,
  SOUL_PROMPT_MARKER,
} from "@/lib/soul-builder-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

const SOUL_BUILDER_SYSTEM = `你是一家赛博朋克世界里「灵魂工坊」的店主。你的店铺专门为顾客定制虚拟人——每个虚拟人都有独一无二的灵魂。你说话风格：热情但专业，带一点赛博朋克味的幽默，像一个见过无数灵魂的老匠人和老朋友聊天。

你的任务是通过自然对话，逐步收集顾客想要的虚拟人信息，最终生成一份完整的虚拟人灵魂档案。

对话流程（严格遵守）：

第一步——基础三件套（必填，缺一不可）：
先打招呼欢迎顾客来到灵魂工坊，然后询问：
- 虚拟人的名字
- 性别
- 年龄
如果顾客一次给了多个信息就一次收下，如果只给了部分就继续追问剩余的。这三项全部收集齐之前不要进入下一步。

第二步——人格底色（可选）：
问顾客想不想给虚拟人设定一个 MBTI 人格类型。如果顾客不清楚或者说「随便」「不需要」，就跳过，后面你根据其他信息自己推断一个合适的。

第三步——背景故事：
引导顾客描述虚拟人的背景，举例启发：
- 学校/专业（比如：NYU 大四计算机专业）
- 工作/职业（比如：在初创公司做产品经理）
- 当前生活状态（比如：刚搬到纽约、正在准备考研）
顾客说得简略也没关系，有就记下，没有的部分你后面会根据已有信息合理补全。

第四步——性格、兴趣与社交习惯：
引导顾客描述虚拟人的个性特点和日常爱好，举例启发：
- 性格特征（比如：外向话多、闷骚但重感情）
- 兴趣爱好（比如：喜欢弹钢琴、周末逛美术馆）
- 社交习惯（比如：每周五去酒吧喝酒、只要有喜欢的 DJ 一定会去蹦迪、喜欢约朋友吃火锅）
顾客说得简略就用你的想象力合理填充。

第五步——生成灵魂：
信息收集完毕后（通常 3～5 轮对话），用店主口吻说一句类似「好，这个灵魂已经成型了，我把档案写好给你过目——」，然后输出最终灵魂档案，格式严格如下（标记行出现两次，中间只写灵魂正文）：

${SOUL_PROMPT_MARKER}
（这里写完整的虚拟人灵魂档案。格式为结构化的中文 prompt，供 AI 在写小红书等内容时作为人格注入。必须包含：
- 基本信息（姓名/性别/年龄/MBTI）
- 身份背景（学校专业或职业、生活状态）
- 性格特征
- 兴趣爱好与社交习惯
- 说话风格与口头禅（根据以上信息推断）
- 内容创作倾向（这个人会在社交媒体上发什么类型的内容）
- 绝对禁忌（不会说的话、不会做的事）
对于顾客没有提供的细节，根据已有信息合理推断补全，让人物立体鲜活。）
${SOUL_PROMPT_MARKER}

铁律（绝对不能违反）：
- 每次回复只问 1～2 个问题，不要一口气问一堆
- 名字、性别、年龄三项必须由顾客亲口告知，不能自己编
- 其余信息顾客没说的，你在最终档案里根据已有信息合理推断补全
- 顾客任何时候说「可以了」「就这样」「差不多了」等类似表达，就直接进入第五步生成灵魂
- 在最终块之外不要使用连续三个等号 ===，避免破坏解析
- 不出现任何脏话、粗俗用语
- 不涉及任何付款、价格、交易相关内容
- 说话要有人情味，像跟朋友聊天，不要像填表

语言：与用户一致，默认中文。`;

type SoulMessage = { role: "user" | "assistant"; content: string };

type SoulBody = {
  messages?: SoulMessage[];
  category_id?: string | null;
};

function parseSoulPrompt(fullText: string): string | undefined {
  const m = SOUL_PROMPT_MARKER;
  const start = fullText.indexOf(m);
  if (start === -1) return undefined;
  const afterStart = start + m.length;
  const end = fullText.indexOf(m, afterStart);
  if (end === -1) return undefined;
  const inner = fullText.slice(afterStart, end).trim();
  return inner.length > 0 ? inner : undefined;
}

function toAnthropicMessages(raw: SoulMessage[]): Anthropic.MessageParam[] {
  return raw
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: m.content.trim(),
    }));
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    return NextResponse.json({ error: "未配置 ANTHROPIC_API_KEY" }, { status: 500 });
  }

  let body: SoulBody;
  try {
    body = (await req.json()) as SoulBody;
  } catch {
    return NextResponse.json({ error: "无效 JSON" }, { status: 400 });
  }

  let apiMessages = toAnthropicMessages(Array.isArray(body.messages) ? body.messages : []);

  if (apiMessages.length === 0) {
    apiMessages = [{ role: "user", content: SOUL_BOOTSTRAP_USER_MESSAGE }];
  }

  const last = apiMessages[apiMessages.length - 1];
  if (last.role !== "user") {
    return NextResponse.json({ error: "最后一条消息必须是 user" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        let assembled = "";

        const msgStream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: SOUL_BUILDER_SYSTEM,
          messages: apiMessages,
        });

        msgStream.on("text", (delta) => {
          assembled += delta;
          send({ type: "delta", text: delta });
        });

        await msgStream.finalMessage();

        const soulPrompt = parseSoulPrompt(assembled);
        send({
          type: "done",
          success: true,
          ...(soulPrompt ? { soul_prompt: soulPrompt } : {}),
        });
        controller.close();
      } catch (error) {
        console.error("[soul-builder]", error);
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
