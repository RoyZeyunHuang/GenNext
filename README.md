# Ops Hub

Next.js 14 运营工作台，App Router + 深色主题 + Supabase + Claude AI 助手。

## 技术栈

- **Next.js 14**（App Router）
- **shadcn/ui** + **Tailwind CSS**（深色主题）
- **@supabase/supabase-js**
- **lucide-react**（图标）

## 开发

```bash
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)，默认会跳转到 `/dashboard`。

## 环境变量

复制 `.env.local` 并填写：

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase 匿名 Key
- `CLAUDE_API_KEY` - Anthropic Claude API Key（AI 助手流式聊天）

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 重定向到 `/dashboard` |
| `/dashboard` | 概览（默认首页） |
| `/documents` | 档案库 |
| `/copywriter` | 文案生成 |
| `/calendar` | AI 日历 |
| `/crm` | BD CRM |
| `/kpi` | KPI |
| `/news` | 新闻摘要 |

## 结构说明

- **左侧导航**：`src/components/Sidebar.tsx`（Logo、导航高亮、底部语言切换 中文/EN）
- **全局布局**：`src/components/LayoutWithSidebar.tsx`（左侧固定 + 右侧内容）
- **AI 助手**：`src/components/AIAssistant.tsx`（底部固定，调用 `/api/ai/chat`，流式打字机效果）
- **Claude 流式**：`src/lib/claude.ts`（封装 Anthropic 流式 API）
- **Supabase**：`src/lib/supabase.ts`（浏览器端客户端）
