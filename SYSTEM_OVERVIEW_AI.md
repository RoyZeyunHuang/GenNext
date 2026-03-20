# Ops Hub 系统概览与部署说明（供 AI 理解）

## 0. 目的
帮助负责在不同环境部署的同事/AI 快速理解本系统的：
1) 前端路由与后端 API 对应关系  
2) 数据流：UI -> Next API -> Supabase/外部服务/Claude AI -> UI  
3) 必需环境变量、Supabase 迁移顺序  
4) 部署后如何验证是否正常

本文档**不包含多语言细节**，以“整个系统如何工作”为主。

## 1. 系统是什么
- 应用名称：Ops Hub（运营工作台）
- 技术栈：
  - Next.js 14（App Router）
  - React 18 + Tailwind CSS
  - Supabase（PostgreSQL + RLS）
  - Claude AI（Anthropic SDK；服务端 Route Handler 调用）

## 2. 代码入口与核心目录
- 前端入口（App Router）在 `src/app/`
- 全局布局与侧栏在 `src/components/LayoutWithSidebar.tsx`、`src/components/Sidebar.tsx`
- 右下角通用 AI 助手在 `src/components/AIAssistant.tsx`
- Supabase 客户端封装在 `src/lib/supabase.ts`
- Claude 流式聊天封装在 `src/lib/claude.ts`
- 数据库迁移在 `supabase/migrations/`（按顺序执行）

## 3. 路由（UI 页面）概览
主要功能页路径如下（对应侧栏导航）：
- `/dashboard`：工作台首页（概览卡片）
- `/documents`：内容工厂（档案/知识库/模板等的管理入口）
- `/copywriter`：内容创作（基于档案/模板生成内容）
- `/calendar`：AI 日历（解析文字/图片为日历事件，写入/导出 .ics）
- `/crm`：BD CRM（楼盘/公司/联系人/跟进/看板等）
- `/kpi`：KPI（数据上传、统计、报表/对比等）
- `/news`：新闻摘要（每日行业简报与社媒选题；可保存为文案灵感）
- `/settings`：设置
- 规划相关：
  - `/planning`：规划列表
  - `/planning/[id]` 以及其子路由：策略/排期/概览等

## 4. 总体数据流（最重要的理解点）
1. 浏览器加载某个页面（例如 `/kpi`）
2. 页面中的客户端组件会通过 `fetch()` 调用 Next.js 的 Route Handler API（例如 `POST /api/kpi/upload`）
3. Route Handler（服务端）通常会：
   - 调用 Supabase（读取/写入表或执行 RPC）
   - 或调用 Claude（生成文本、解析日程、生成跟进话术等）
   - 返回 JSON 给前端（有些 AI 能力会使用流式方式再由前端拼接/渲染）
4. 前端根据返回结果更新 UI

关键点：
- **Claude API Key 只应存在服务端环境变量**（Route Handler 运行在服务端）
- **Supabase 认证与 RLS 策略**决定了前端能否读取/写入数据

## 5. Supabase 数据与迁移
### 5.1 迁移顺序（必须按序执行）
Supabase SQL 迁移在 `supabase/migrations/`，本项目约定执行顺序为：
`001_initial_tables.sql -> 002_documents_copywriter.sql -> 003_calendar_events.sql -> 004_calendar_events_columns.sql -> 005_crm_tables.sql -> 006_xhs_tables.sql -> 007_content_factory.sql`

### 5.2 RLS（行级安全）策略
当前项目文档描述为：开发/演示阶段使用“匿名全读写”策略（便于快速跑通）。
生产环境建议替换为：
- 使用 Supabase Auth 用户
- 按 `auth.uid()` 或角色策略限制读写范围

部署到别处时，如果发现页面“加载为空”或“写入失败”，优先检查 RLS 策略与表是否存在。

## 6. AI 与外部依赖
### 6.1 全局 AI 助手（右下角）
- 前端组件：`src/components/AIAssistant.tsx`
- 请求接口：`POST /api/ai/chat`
- 请求 body（示例形状）：
  - `message`: 用户输入字符串
  - `conversation_history`: 形如 `[{ role: "user"|"assistant", content: string }]` 的历史
- 服务端行为：
  - 在 `src/app/api/ai/chat/route.ts` 内部，使用 Claude 工具调用（tools）
  - 根据 tool call 结果再继续迭代，最终返回：
    - `NextResponse.json({ reply: finalText, success: true })`

### 6.2 业务 AI 路由（页面专用）
除 `/api/ai/chat` 外，本项目还存在大量“业务专用 AI API”，例如：
- `/api/ai/generate`：文案生成相关
- `/api/ai/detect-intent`：意图识别/推荐相关
- `/api/ai/calendar`：日历解析相关
- `/api/ai/crm-followup`：CRM 跟进话术生成相关
- `/api/ai/planning-*`：规划脚本/摘要/主题/排期相关

多数情况下，这些 Route Handler 会：
- 从 Supabase 读取档案/模板/历史数据
- 通过 Claude 生成文本或结构化结果
- 写回 Supabase 或返回给前端

### 6.3 新闻外部日报 API
- `GET /api/news/daily` 会调用一个外部固定 URL 获取当日新闻数据（代码里是写死的外部地址）
- 同时会从 Supabase 读取历史（`news_items`）

部署到别的地方/网络环境时，如果外部 URL 不可达，会导致 `/news` 当天内容为空或报错。

### 6.4 浏览器端 PDF 解析 worker
部分“解析文件文本”逻辑使用 PDF.js worker 的 CDN（部署到内网时注意 worker 可访问性）。

## 7. 环境变量（必须配置）
在部署平台设置环境变量时分两类：

### 7.1 浏览器可见（NEXT_PUBLIC_ 前缀）
- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL（必填）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 匿名 Key（必填）

### 7.2 服务端环境变量（不带 NEXT_PUBLIC_）
- `CLAUDE_API_KEY` 或 `ANTHROPIC_API_KEY`：Claude API Key（必填至少一个）

说明：
- `src/lib/supabase.ts` 使用 `NEXT_PUBLIC_SUPABASE_*` 初始化
- Claude 调用的 API Key 在多个 Route 内优先读取 `ANTHROPIC_API_KEY`，其次 `CLAUDE_API_KEY`
- 代码采用了“lazy 初始化 Supabase client”，因此构建阶段通常不需要立即存在 Supabase env，但运行 API 时必须存在。

## 8. 部署步骤（建议流程）
1. 克隆仓库
2. 安装依赖：`npm install`
3. Supabase：
   - 新建 Supabase 项目或使用目标项目
   - 在 SQL Editor 按迁移顺序执行 `supabase/migrations/001...007`
4. 部署平台配置环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `CLAUDE_API_KEY` 或 `ANTHROPIC_API_KEY`
5. 构建与启动：
   - `npm run build`
   - `npm run start`
6. 部署后验证（见下一节）

## 9. 部署后验证清单（快速判断是否“跑通”）
建议按这个顺序做最小闭环验证：
1. 打开 `/dashboard`，确认页面不报错、侧栏正常
2. 打开 `/news`，确认：
   - 页面加载成功
   - 当天内容是否能从外部日报 API 拉取（若不可达可能为空/异常）
3. 打开 `/calendar`：
   - 点击生成（需要 Claude 能力与 worker/解析链路）
   - 确认能写入 `calendar_events` 或至少不报 500
4. 打开 `/kpi`：
   - 触发一次数据上传流程（如上传 Notes/paid/ig，取决于当前页面实现）
   - 确认 API 写入与统计查询能正常返回
5. 打开 `/crm`：
   - 切换到不同 tab，确认读取 CRM 数据与写入不为空
6. 使用右下角 AI 助手：
   - 发送一条简单问题（如“今天有什么日程？”或“搜索某公司”）
   - 确认服务端返回 `success: true`，前端渲染回复

如果任何一步失败，查看以下方向：
- 环境变量是否配置（尤其是 `CLAUDE_API_KEY`/`ANTHROPIC_API_KEY` 和 `NEXT_PUBLIC_SUPABASE_*`）
- Supabase 表是否存在、RLS 是否阻止匿名读写
- 外部新闻日报 URL 是否可达（`/api/news/daily`）

## 10. 常见故障模式与处理
1. 前端报错但页面能加载：通常是某个 API 返回 500
2. 所有页面数据为空：高度怀疑 Supabase RLS 或迁移未执行
3. AI 相关功能不可用：通常是 Claude Key 未配置或服务端无法访问 Anthropic
4. `/news` 当天数据为空：外部日报 URL 不通或网络策略导致 fetch 失败

## 11. 你应该如何“给 AI 看”继续追踪
当需要定位某个功能失败时，让 AI 按以下顺序查：
1. 前端调用哪个 API：在相关页面组件中搜索 `fetch("/api/...")`
2. Route Handler 做了什么：查看 `src/app/api/**/route.ts`
3. Supabase 操作了哪些表：Route 内的 `supabase.from("...")` / `supabase.rpc("...")`
4. Claude 工具调用/生成提示词：查看 tool 定义与 `anthropic.messages.create(...)` 参数
5. 若写入失败：回到 Supabase 控制台检查表结构与 RLS 策略

