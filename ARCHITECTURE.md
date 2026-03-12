# Ops Hub 应用架构与业务流程文档

本文档面向需要理解、维护或在新环境部署本应用的同事，包含技术架构、数据模型、各模块业务流程及部署要点。

---

## 一、项目概述

**应用名称**：Ops Hub（运营工作台）  
**定位**：面向运营/BD/内容团队的一体化工作台，涵盖内容创作、日历、CRM、KPI 看板、新闻摘要与全局 AI 助手。

**技术栈**：

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14（App Router） |
| 语言 | TypeScript |
| UI | React 18、Tailwind CSS、Radix UI、Lucide Icons、Recharts |
| 后端/API | Next.js Route Handlers（API Routes） |
| 数据库 | Supabase（PostgreSQL + RLS） |
| AI | Anthropic Claude（`@anthropic-ai/sdk` + 自封装 `lib/claude.ts`） |
| 文档解析 | mammoth（docx）、pdfjs-dist（PDF）、xlsx（Excel） |

**环境要求**：Node.js 18+，npm 或 pnpm。

---

## 二、目录结构（核心）

```
GenNext/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # 根布局（侧栏 + AI 助手）
│   │   ├── page.tsx            # 首页（通常重定向或入口）
│   │   ├── dashboard/          # 概览
│   │   ├── documents/          # 内容工厂
│   │   ├── copywriter/        # 内容创作
│   │   ├── calendar/          # AI 日历
│   │   ├── crm/                # BD CRM
│   │   ├── kpi/                # KPI
│   │   ├── news/               # 新闻摘要
│   │   └── api/                # 所有 API 路由
│   │       ├── ai/             # AI：generate, detect-intent, chat, calendar, crm-followup
│   │   │   ├── generate/       # 文案流式生成
│   │   │   ├── detect-intent/  # 意图识别推荐档案/模板
│   │   │   ├── chat/           # 全局 AI 助手流式对话
│   │   │   ├── calendar/       # 从文字/图片解析日历事件
│   │   │   └── crm-followup/   # BD 跟进话术生成
│   │   ├── brand-docs/         # 品牌档案 CRUD
│   │   ├── knowledge-docs/     # 知识库 CRUD
│   │   ├── task-templates/     # 任务模板 CRUD
│   │   ├── persona-templates/  # 人格模板 CRUD
│   │   ├── generated-copies/   # 文案生成历史（v2）列表与新增
│   │   ├── calendar/           # 日历事件 CRUD、今日
│   │   ├── news/               # 每日新闻、保存灵感
│   │   ├── crm/                # 公司、联系人、楼盘、跟进等
│   │   └── kpi/                # 数据上传、统计、报表、楼栋/AE 列表等
│   ├── components/             # 可复用组件
│   │   ├── LayoutWithSidebar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── AIAssistant.tsx
│   │   ├── ui/                 # 基础 UI（button 等）
│   │   ├── dashboard/          # 概览卡片
│   │   ├── documents/          # 内容工厂各 Tab
│   │   ├── copywriter/         # 内容创作页客户端
│   │   ├── calendar/           # 日历页客户端
│   │   ├── crm/                # CRM 各 Tab
│   │   └── kpi/                # KPI 各 Tab
│   ├── lib/                    # 工具与封装
│   │   ├── supabase.ts         # Supabase 客户端（浏览器/服务端）
│   │   ├── claude.ts           # Claude 流式对话封装
│   │   ├── utils.ts            # cn 等工具
│   │   ├── extractFileText.ts  # 浏览器端 TXT/DOCX/PDF 文本提取
│   │   └── ics.ts              # 生成 .ics 日历文件
│   └── types/                  # 类型定义
├── supabase/
│   └── migrations/             # 数据库迁移（按顺序执行）
│       ├── 001_initial_tables.sql
│       ├── 002_documents_copywriter.sql
│       ├── 003_calendar_events.sql
│       ├── 004_calendar_events_columns.sql
│       ├── 005_crm_tables.sql
│       ├── 006_xhs_tables.sql
│       └── 007_content_factory.sql
├── import/                     # 可选：本地 SQLite 等导入数据
├── .env.local                  # 环境变量（勿提交密钥）
├── package.json
└── ARCHITECTURE.md             # 本文档
```

---

## 三、数据层（Supabase）

所有表均开启 RLS，当前策略为匿名全读写（开发/演示用；生产建议改为认证用户 + 细粒度策略）。

### 3.1 基础与通用（001、002、003）

| 表名 | 说明 |
|------|------|
| `calendar_events` | 日历事件：title, date, start_time, end_time, location, description |
| `news_items` | 新闻摘要/灵感：source_url, source_text, summary_zh, summary_en, tags |
| `todos` | 待办：content, done, due_date |
| `kpi_entries` | KPI 进度条：period, period_type, category, metric_name, value, target |
| `documents` | 旧版档案库文档（name, type, content, file_url） |
| `generated_copies` | 旧版文案生成记录（document_ids, prompt, output, type, starred） |

### 3.2 CRM（005）

| 表名 | 说明 |
|------|------|
| `companies` | 公司：name, type, phone, email, website |
| `contacts` | 联系人：company_id, name, title, phone, email, linkedin_url, is_primary |
| `properties` | 楼盘：name, address, city, area, price_range, units, build_year |
| `property_companies` | 楼盘-公司关联：property_id, company_id, role |
| `outreach` | 跟进：property_id, status, contact_name, contact_info, notes |

### 3.3 内容工厂与文案 v2（007）

| 表名 | 说明 |
|------|------|
| `brand_docs` | 品牌档案：title, content, property_name, tags, is_global |
| `knowledge_docs` | 知识库：title, content, type, tags, source_url |
| `task_templates` | 任务模板：title, platform, content, is_default（如小红书/Instagram/LinkedIn/微信） |
| `persona_templates` | 人格模板：title, description, content, is_default |
| `generated_copies_v2` | 文案生成历史：user_input, brand_doc_ids, knowledge_doc_ids, task_template_id, persona_template_id, detected_intent, output, platform, starred |

### 3.4 小红书/Instagram KPI（006）

| 表名 | 说明 |
|------|------|
| `core_posts` | 小红书帖子主表：post_key(PK), title, note_id, content, publish_time 等 |
| `dict_posts` | 帖子字典/去重用 |
| `post_attributes` | 帖子属性：post_key, ae, building, updated_by |
| `paid_metrics_daily` | 付费指标按日：post_key, event_date, spend, impressions, clicks 等 |
| `xhs_post_metrics_snapshots` | 小红书自然流快照：post_key, snapshot_date, exposure, views, likes 等 |
| `daily_top30_snapshot` | 每日 Top30 快照 |
| `core_ig_posts` | Instagram 帖子主表 |
| `ig_post_metrics_snapshots` | IG 指标快照 |
| `kpi_registry` | KPI 指标注册表（配置用） |
| `campaign_reports` | 活动报表：title, summary, date_from, date_to, aggregate_json, top_posts_json |

迁移执行顺序：**001 → 002 → 003 → 004 → 005 → 006 → 007**（在 Supabase SQL Editor 或 CLI 中按序执行）。

---

## 四、前端路由与页面职责

| 路径 | 页面 | 职责 |
|------|------|------|
| `/` | 首页 | 入口/重定向 |
| `/dashboard` | 概览 | 本周 KPI、待办、日历卡片、新闻卡片 |
| `/documents` | 内容工厂 | 品牌档案 / 知识库 / 任务模板 / 人格模板 的 CRUD |
| `/copywriter` | 内容创作 | 输入需求 → 意图识别 → 选档案与模板 → 流式生成文案 → 保存/收藏历史 |
| `/calendar` | AI 日历 | 文字或图片 → AI 解析事件 → 写入日历并下载 .ics |
| `/crm` | BD CRM | 公司、联系人、楼盘、跟进管线、AI 跟进话术 |
| `/kpi` | KPI | 数据上传（自然流/付费/IG）、概览、报表、楼栋/AE 列表、AI 分析等 |
| `/news` | 新闻摘要 | 拉取外部每日简报 + 社媒选题，保存为灵感到 `news_items` |

全局：侧栏 `Sidebar` + 右下角 `AIAssistant`（调用 `/api/ai/chat` 流式对话）。

---

## 五、API 路由清单与职责

### 5.1 AI 相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate` | 文案流式生成：入参 brand_doc_ids, knowledge_doc_ids, task_template_id, persona_template_id, user_input；拉取全局+选中品牌/知识库/任务/人格，拼 system+user，调用 Claude 流式输出 |
| POST | `/api/ai/detect-intent` | 意图识别：user_input → 返回 suggested_brand_docs, suggested_knowledge, suggested_task_template, suggested_persona 等 |
| POST | `/api/ai/chat` | 全局 AI 助手：messages → 使用 `lib/claude.ts` 流式 SSE 返回 |
| POST | `/api/ai/calendar` | 日历解析：text 或 imageBase64+imageMediaType → Claude 多模态 → 返回事件 JSON 数组 |
| POST | `/api/ai/crm-followup` | BD 跟进话术：companyName, recentNotes → 生成微信跟进文案 |

### 5.2 内容工厂与文案

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/brand-docs` | 品牌档案列表/新增 |
| GET/PUT/DELETE | `/api/brand-docs/[id]` | 单条品牌档案 |
| GET/POST | `/api/knowledge-docs` | 知识库列表/新增 |
| GET/PUT/DELETE | `/api/knowledge-docs/[id]` | 单条知识库 |
| GET/POST | `/api/task-templates` | 任务模板列表/新增 |
| GET/PUT/DELETE | `/api/task-templates/[id]` | 单条任务模板 |
| GET/POST | `/api/persona-templates` | 人格模板列表/新增 |
| GET/PUT/DELETE | `/api/persona-templates/[id]` | 单条人格模板 |
| GET/POST | `/api/generated-copies` | 文案历史（v2）列表 / 新增一条（含 starred） |

### 5.3 日历与新闻

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/DELETE | `/api/calendar/events` | 日历事件列表/批量新增/按 id 删除 |
| GET | `/api/calendar/today` | 今日事件（可选） |
| GET | `/api/news/daily` | 外部 API 取每日简报 + 本库 news_items 历史 |
| POST | `/api/news/save` | 保存一条新闻为灵感（news_items） |

### 5.4 CRM

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/crm/dashboard-stats` | 楼盘数、跟进数、赢单/输单、赢率、平均天数、状态分布、近 12 周趋势等 |
| GET/POST | `/api/crm/companies` | 公司列表/新增 |
| GET/PUT/DELETE | `/api/crm/companies/[id]` | 单公司 |
| GET | `/api/crm/companies/[id]/contacts` | 公司下联系人 |
| GET/POST | `/api/crm/properties` | 楼盘列表/新增 |
| GET/PUT/DELETE | `/api/crm/properties/[id]` | 单楼盘 |
| GET/POST | `/api/crm/outreach` | 跟进列表/新增 |
| GET/PUT/DELETE | `/api/crm/outreach/[id]` | 单条跟进 |
| PUT | `/api/crm/outreach/[id]/note` | 更新跟进备注 |

### 5.5 KPI

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/kpi/upload` | 上传数据：type=organic|paid|ig，rows + 可选 snapshot_date；写入 core_posts / xhs 或 ig 快照 / paid_metrics_daily |
| GET | `/api/kpi/organic-stats` | 自然流统计 |
| GET | `/api/kpi/paid-stats` | 付费统计 |
| GET | `/api/kpi/ig-stats` | Instagram 统计 |
| GET | `/api/kpi/top-posts` | Top 帖子等 |
| GET | `/api/kpi/building-list` | 楼栋列表（post_attributes.building） |
| GET | `/api/kpi/ae-list` | AE 列表（post_attributes.ae） |
| GET/POST | `/api/kpi/campaign-reports` | 活动报表列表/新增 |
| GET | `/api/kpi/campaign-reports/[id]` | 单份报表 |

---

## 六、业务流程（按模块）

### 6.1 内容创作（Copywriter）

1. **进入页面**：拉取品牌档案、知识库、任务模板、人格模板、文案历史（generated_copies_v2）。
2. **输入需求**：用户输入自然语言（如「给 XX 楼盘写一篇小红书种草」）。
3. **意图识别（可选）**：点击「智能推荐」→ `POST /api/ai/detect-intent`，根据目录与规则返回推荐 brand_docs、knowledge_docs、task_template、persona；前端自动勾选。
4. **选择上下文**：用户可手动增删「品牌档案」「知识库」「任务模板」「人格模板」。
5. **生成**：`POST /api/ai/generate`，body 含上述 id 与 user_input。后端拉取全局品牌 + 选中档案与模板内容，拼成 system/user，调用 Claude 流式生成；前端逐字展示。
6. **保存/收藏**：生成结束后可「保存到历史」→ `POST /api/generated-copies` 写入 `generated_copies_v2`（含 output、platform、starred 等）；历史列表来自同一 API 的 GET。

关键表：`brand_docs`、`knowledge_docs`、`task_templates`、`persona_templates`、`generated_copies_v2`。

### 6.2 内容工厂（Documents）

- **品牌档案**：增删改查 `brand_docs`，支持 `property_name`、`is_global`、tags；支持上传文件（前端用 `extractFileText` 解析 TXT/DOCX/PDF）后把文本写入 content。
- **知识库**：同上，表为 `knowledge_docs`，有 type、tags、source_url。
- **任务模板**：CRUD `task_templates`，平台如 xiaohongshu/instagram/linkedin/wechat，有预设默认模板（007 迁移中 INSERT）。
- **人格模板**：CRUD `persona_templates`，有预设人设（007 迁移中 INSERT）。

文案生成时从这些表读取内容注入 AI prompt。

### 6.3 AI 日历（Calendar）

1. **输入**：用户输入文字描述或上传一张图片（JPG/PNG）。
2. **解析**：`POST /api/ai/calendar`，传 `text` 或 `imageBase64`+`imageMediaType`；Claude 多模态解析，返回事件数组 `[{ title, date, startTime, endTime, location, description }]`。
3. **写入与下载**：前端将结果批量 `POST /api/calendar/events` 写入 `calendar_events`，并用 `lib/ics.ts` 生成 .ics 供用户下载。

日历列表、删除：GET/DELETE `/api/calendar/events`。

### 6.4 BD CRM

- **数据模型**：公司 → 联系人（一对多）；楼盘 ↔ 公司（多对多，通过 property_companies）；跟进（outreach）关联楼盘，含 status、联系人信息、notes。
- **看板**：`/api/crm/dashboard-stats` 聚合楼盘数、跟进总数、赢/输单、赢率、平均成交天数、状态分布、近 12 周创建趋势。
- **跟进话术**：在跟进详情或列表中可调用 `POST /api/ai/crm-followup`（companyName + recentNotes）生成微信跟进文案。

CRUD 均通过上述 crm 系列 API 操作 companies、contacts、properties、outreach。

### 6.5 KPI

1. **数据来源**：  
   - 自然流（小红书）：上传 Excel/JSON，`type=organic`，与 `core_posts` 按 title+时间或 title 匹配 post_key，写入/更新 `xhs_post_metrics_snapshots`；若无则先插入 `core_posts`。  
   - 付费：`type=paid`，按 note_id 关联 core_posts，写入 `paid_metrics_daily`。  
   - Instagram：`type=ig`，写入 `core_ig_posts` 与 `ig_post_metrics_snapshots`。
2. **展示**：organic-stats、paid-stats、ig-stats、top-posts、building-list、ae-list 等接口做筛选与聚合。
3. **报表**：campaign-reports 存储活动周期、汇总与 Top 帖子等，供报表页展示。

### 6.6 新闻摘要（News）

1. **拉取**：`GET /api/news/daily` 请求外部日报 API（代码中为固定 URL：`https://laundry-presentations-painting-rpg.trycloudflare.com/daily-report`），得到当日行业简报 + 社媒选题。
2. **展示**：前端分块展示「行业简报」「社媒选题」。
3. **保存灵感**：用户点击「转为文案灵感」→ `POST /api/news/save`，写入 `news_items`（source_url, summary_zh, tags）。

部署到别处时需替换或配置该外部日报 API 地址。

### 6.7 全局 AI 助手（AIAssistant）

- 右下角浮窗，输入多轮对话。
- 请求：`POST /api/ai/chat`，body 为 `{ messages: [{ role, content }] }`。
- 使用 `lib/claude.ts` 的 `streamClaudeChat`，SSE 流式返回，前端拼接为 assistant 消息。

与「内容创作」区别：此处为通用对话，不注入品牌/知识库/模板；内容创作为专用文案生成并写库。

---

## 七、外部依赖与环境变量

### 7.1 环境变量（.env.local）

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase 匿名公钥（用于浏览器+服务端） |
| `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY` | 是 | Claude API Key（文案生成、意图识别、日历解析、CRM 话术、全局聊天） |

说明：代码中优先使用 `ANTHROPIC_API_KEY`，其次 `CLAUDE_API_KEY`。部署时至少配置其一。

### 7.2 外部服务

- **Supabase**：数据库 + RLS；需在 Supabase 控制台执行全部迁移。
- **Anthropic Claude**：所有 AI 能力（文案、意图、日历、CRM、聊天）。
- **新闻日报**：当前写死在一个 trycloudflare.com 的 URL，部署到别处时应改为可配置（如环境变量 `NEXT_PUBLIC_NEWS_DAILY_API` 或后端配置），或替换为自建/其他数据源。

### 7.3 浏览器端依赖

- **PDF.js worker**：`extractFileText.ts` 使用 CDN：`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`。若内网部署需考虑可访问性或自托管 worker。

---

## 八、部署到新环境（步骤摘要）

1. **代码与依赖**  
   - 克隆仓库，执行 `npm install`（或 pnpm）。

2. **Supabase**  
   - 新建 Supabase 项目（或使用现有项目）。  
   - 在 SQL Editor 中按顺序执行 `supabase/migrations/001_initial_tables.sql` 至 `007_content_factory.sql`。  
   - 在 Project Settings → API 中复制 URL 与 anon key。

3. **环境变量**  
   - 在部署平台（Vercel/自建 Node 等）配置：  
     - `NEXT_PUBLIC_SUPABASE_URL`  
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
     - `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`  
   - 若新闻源不同：在代码或配置中替换 `/api/news/daily` 中使用的日报 API 地址（建议改为环境变量）。

4. **构建与运行**  
   - `npm run build`  
   - `npm run start`（或平台默认 start 命令）。  
   - 开发：`npm run dev`。

5. **安全建议（生产）**  
   - 启用 Supabase 认证，将 RLS 策略从「匿名全开」改为按 `auth.uid()` 等限制。  
   - 不要在前端或日志中暴露 API Key；Claude 调用仅在服务端（Route Handlers）进行，已满足基本隔离。  
   - 若新闻 API 或其它代理在服务端调用，敏感 URL 或 Key 建议仅放在服务端环境变量。

6. **可选**  
   - 从旧环境或 `import/` 下的 SQLite 等迁移数据到 Supabase（若有现成迁移脚本如 `migrate-xhs-sqlite-to-supabase.js`，需在目标环境配置后执行）。

---

## 九、文档与代码索引

- **侧栏导航**：`src/components/Sidebar.tsx`（navItems 与路径）。  
- **Supabase 客户端**：`src/lib/supabase.ts`。  
- **Claude 流式封装**：`src/lib/claude.ts`（全局聊天）；文案/日历等使用 `@anthropic-ai/sdk` 在对应 route 内直接调用。  
- **文案生成与意图**：`src/app/api/ai/generate/route.ts`、`src/app/api/ai/detect-intent/route.ts`。  
- **内容创作前端**：`src/components/copywriter/CopywriterClient.tsx`。  
- **内容工厂**：`src/components/documents/ContentFactoryClient.tsx` 及各 Tab 组件。  
- **日历**：`src/components/calendar/CalendarClient.tsx`，`src/app/api/ai/calendar/route.ts`，`src/app/api/calendar/events/route.ts`。  
- **KPI 上传与匹配逻辑**：`src/app/api/kpi/upload/route.ts`（organic/paid/ig 三种类型）。

若后续新增模块或表，建议在本文档对应章节补充「表结构」「API 清单」「业务流程」三部分，并更新部署与环境变量说明。
