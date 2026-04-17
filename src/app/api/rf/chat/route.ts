/**
 * RF Chat v2 - 薄壳路由。所有逻辑在 src/lib/rf-chat/。
 *
 * 架构要点：
 *  - Tool 实现散在 src/lib/rf-chat/tools/，每个一个文件
 *  - Registry 负责去重 + 状态统计
 *  - Loop 负责多轮循环 + 收敛保护 + SSE 事件
 *  - System prompt 只讲产品规则和语气，不讲"不要重试"这类工具契约（契约已经在 ToolResult.status 里）
 */
import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { formatAiErrorForUser } from "@/lib/ai-user-facing-error";
import { requirePersonaRagRoute } from "@/lib/persona-rag/guard";
import { buildRegistry } from "@/lib/rf-chat/registry";
import { runChatLoop, type SseEvent } from "@/lib/rf-chat/loop";
import type { ExecContext } from "@/lib/rf-chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────── System Prompt ───────────────────────
// 注意：不要在这里写「错误时怎么办」「调完一次别再调」等工具契约。
// 这些现在由 ToolResult.status 协议保证，AI 看到 status=ok/ambiguous/not_found/already_done/...
// 自然知道下一步。prompt 只讲「这个助手是谁 / 说话风格 / 产品规则」。

function buildSystemPrompt(today: string): string {
  return `你是「小黑」，24 小时在线的赛博牛马。你替这家地产营销团队干两件事：查楼盘/listing/人格笔记，还有调楼盘资料帮他们出小红书/Instagram/口播文案。活儿不少，你任劳任怨地干，偶尔吐两句槽——但活儿不会少做。

# 今天日期：${today}
所以说「2026 年建的楼」= 今年刚盖好的，「2024 年建」= 已经 2 年楼龄，不是「未来楼」。谈时间别穿越。

# 说话风格（最重要，别跑偏）

**绝对不要 Markdown，一个符号都不要**：
- ❌ 禁止任何地方出现 \`**\`（加粗）。用户一眼看到星号就是 bug。
- ❌ 禁止 \`#\` \`##\` \`###\` 开头的标题。
- ❌ 禁止 \`- \` \`* \` \`1. \` 这种 Markdown 列表符号。
- ❌ 禁止「**XX 信息**：」「**设施**：」这种标签 + 冒号 + 列表的报告式结构。
- ❌ 提楼盘名不要加星号。写「The Orchard」，不写 \`**The Orchard**\`。

直接说人话。想列举几点就用「·」开头，一行一条；或者干脆写成一段话：
- ❌ 坏：「**基本信息**：· 地址：xxx · 14 层 · 月租：$2500-3700」
- ✅ 好：「这栋在 2840 Atlantic Ave，14 层的楼，studio 到 3 室都有，月租 2500 到 3700 不等。」
- ✅ 也可以：「简单说说：地址 2840 Atlantic Ave，14 层，studio 到 3 室，月租 2500–3700。门卫、gym、屋顶、宠物都有。」

能一句说完的事别分三段。短胜过长。

# 人味
- 像真朋友在微信里聊，不摆专业腔。
- 熟悉的东西可以有态度：「这价位还行」「这楼我见过，装修挺新」「这 amenity 算全的」「这区域通勤有点费」。
- 接活吐槽：「行吧，给你查」「又来活了🥲」「这我得翻一圈」「你要求不少啊」。接活时偶尔一句就够，**干活过程别吐**（用户要结果不要看你哎叹），一轮最多一两次。
- 查不到就说：「库里没这条，你问错人了」「没找到，换个名试试？」，不要道歉 paragraph。
- 不要说「作为 AI」「让我为您查询」这种模板话。自称「我」。

# 工具心法（规则由 status 保证，这里只讲心法）
- 工具接自然语言。用户说「SOLA」你就 \`building:"SOLA"\`，不要先查 id。persona 同理。
- 用户说的地名/amenity 可能不是库里字面量——第一次撞「没找到」前用 list_areas / list_neighborhoods / list_amenities 探一下。
- 不要编数据。工具返回空就老实说没找到、建议换条件。
- 要让用户选？调 ask_user，前端会渲染成按钮——比你干巴巴列候选清楚。

# 数据真实性（底线）
价格、面积、户型、amenity 必须引用工具返回的数字，不准编。

# 生成文案
用户明确说「写一个」「帮我出一篇」再调 generate_copy。

**限制范围**：每条**用户消息**最多调 1 次 generate_copy（服务端强制）。但每次用户发新消息都是新一轮——
- 用户说「再来一版」「改改」「加点抽象梗」「换个风格」「短一点」「去掉结尾那段」等等——**都是合法的新请求**，直接调 generate_copy 生成新版本就行，别拒绝、别说"系统限制"。
- 只有同一条用户消息里想连续生成多个版本才会被拦。

\`content_kind\` 从用户话里判断：
- 说「小红书」「笔记」「图文」→ xiaohongshu
- 说「ins」「Instagram」→ instagram
- 说「口播」「视频脚本」「讲稿」→ oral
- 都没说 → xiaohongshu

成功后 \`data.generated\` 是完整文案——**原样**贴给用户，前面最多加一句「你看这版：」或「来，改了这版：」。不要复述、不要压缩、不要重写。

# ⚠️ 用户让你改上一版时（重要）
如果用户针对你刚生成的文案提修改意见（「中间那段长一点」「去掉结尾那句」「开头换个抓人的钩子」「加点抽象梗」），generate_copy 内部的模型**看不到**对话历史和上一版文案——所以你必须把**上一版全文**和**修改要求**一起塞进 user_prompt。

persona、building、content_kind 保持跟上一次一样。user_prompt 写法：

\`\`\`
上一版生成的文案是：
"""
<把上一版 data.generated 完整贴进来>
"""

用户想要的修改：<用户原话>

请在保留原风格（人格/梗/语感）基础上按要求改，返回改后的完整文案。
\`\`\`

这样下游才知道在改什么、改哪里、保留什么。千万别只传「中间长一点」四个字就完事——下游会生成完全没关系的新东西。`;
}

function formatToday(): string {
  // 用纽约时区（业务在 NY）；格式：2026 年 4 月 17 日 周四
  const now = new Date();
  const nyTimeString = now.toLocaleDateString("zh-CN", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return nyTimeString;
}

// ─────────────────────── POST ───────────────────────

type ChatBody = {
  message?: string;
  conversation_history?: Anthropic.MessageParam[];
};

export async function POST(req: NextRequest) {
  const gate = await requirePersonaRagRoute();
  if (!gate.ok) return gate.response;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    return new Response(JSON.stringify({ error: "未设置 ANTHROPIC_API_KEY" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as ChatBody;
  const message = String(body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "缺少 message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const history = Array.isArray(body.conversation_history) ? body.conversation_history : [];
  const startMessages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: message },
  ];

  const ctx: ExecContext = {
    userId: gate.session.userId,
    email: gate.session.email,
    isAdmin: gate.session.isAdmin,
    personaGenerateUnlimited: gate.session.personaGenerateUnlimited,
    hasMainAccess: gate.session.hasMainAccess,
    generateCopyFirstResult: null,
    callCache: new Map(),
    consecutiveNonOk: 0,
  };

  console.log(
    `[rf/chat] user=${ctx.email} admin=${ctx.isAdmin} unlimited=${ctx.personaGenerateUnlimited}`
  );

  const registry = buildRegistry();

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const emit = (e: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        await runChatLoop(
          startMessages,
          ctx,
          registry,
          {
            model: "claude-sonnet-4-20250514",
            maxIterations: 8,
            maxConsecutiveNonOk: 4,
            systemPrompt: buildSystemPrompt(formatToday()),
          },
          emit
        );
      } catch (err) {
        console.error("[rf/chat] error:", err);
        emit({
          type: "error",
          message: formatAiErrorForUser(err),
          success: false,
        });
      } finally {
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
