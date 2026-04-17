import { ChatClient } from "@/components/chat/ChatClient";

export default function ChatPage() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col">
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
    </div>
  );
}
