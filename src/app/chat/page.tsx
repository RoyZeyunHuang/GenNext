import { ChatClient } from "@/components/chat/ChatClient";

/**
 * /chat 路由在 LayoutWithSidebar 里走 FULL_HEIGHT_ROUTES 分支：
 * main 高度 = 100dvh，无外层滚动。ChatClient 用 flex-1 直接填满。
 */
export default function ChatPage() {
  return (
    <ChatClient
      title="小黑"
      subtitle="24 小时赛博牛马 · 查楼盘 · 出文案"
      examples={[
        "LIC 有哪些 $3500 以下的 studio？",
        "Halletts 那几栋楼最新价格",
        "带泳池 + 2024 年建的楼",
        "用 Mia 人格给 SOLA 写一篇",
      ]}
    />
  );
}
