# 内容生成逻辑与材料库（内容工厂）说明

本文档汇总当前代码中 **内容创作页（Copywriter）** 的生成流程、**Prompt 拼装规则**，以及 **材料库**（Supabase `doc_categories` + `docs`，产品内「内容工厂」）的数据模型与相关行为。实现以仓库内源码为准。

---

## 一、材料库：表结构与概念

### 1.1 `doc_categories`（类别）

| 字段 | 含义 |
|------|------|
| `id` | UUID |
| `name` | 类别名称（界面展示；部分逻辑按名称硬编码映射，见下文） |
| `icon` | 图标（emoji 等） |
| `description` | 可选说明 |
| `is_auto_include` | 若为 `true`：**部分其他 AI 接口**会自动拉取该类别下**全部**文档拼进上下文（**不包含**内容创作的 `/api/ai/generate`） |
| `sort_order` | 排序；迁移中「标题套路」类为 `6`，也用于识别标题模版类 |

迁移 `012` 曾插入默认类别名（品牌档案、知识库、任务模板、人格模板）；实际部署中类别可增删改名（如「规范」「灵魂」「任务」「标题」等）。

### 1.2 `docs`（文档 / 单篇材料）

| 字段 | 含义 |
|------|------|
| `id` | UUID |
| `category_id` | 所属类别 |
| `title` | 标题 |
| `content` | 正文（**内容生成时，选中的文档会整篇 `trim` 后进入 Prompt，知识类默认不做字数截断**） |
| `tags` | 标签数组 |
| `metadata` | JSON 扩展 |
| `role` | 见迁移 `030`：`constraint` \| `reference` \| `style` \| `format` |
| `priority` | 数字，**仅 `constraint` 文档**在 Prompt 内按降序排序时用 |
| `summary` | 可选（迁移增加，当前生成主路径未依赖） |

历史数据可能从旧表（如 `brand_docs` 等）迁入 `docs`，以迁移脚本为准。

### 1.3 产品与 API

- **内容工厂 UI**：`ContentFactoryClient`；类别 CRUD：`/api/docs/categories`；文档 CRUD：`/api/docs`。
- **内容创作 UI**：`CopywriterClient`；拉取同上 API 得到类别与文档列表。
- **旧「品牌档案」独立 Tab**（若仍存在）：`BrandDocsTab` / `brand-docs` API，与内容工厂的 `docs` 是不同数据面，本文以 **内容工厂 `docs`** 为主。

---

## 二、类别名 → Prompt 角色（硬编码，优先于 DB `docs.role`）

源码：`src/lib/doc-category-constants.ts` 中 `CATEGORY_NAME_TO_PROMPT_ROLE` 与 `resolvePromptDocRole`。

**规则**：若文档所属类别的 `name` 命中下表，则 **以表为准**；否则使用 `docs.role`；再非法则回落 `reference`。

| 类别名（示例） | Prompt 角色 | 在 `buildSystemPrompt` 中进入的区块 |
|----------------|---------------|--------------------------------------|
| 规范、品牌档案 | `constraint` | `<brand_rules>` 硬约束 |
| 知识、知识库 | `reference` | `<knowledge>` 参考素材 |
| 灵魂、人格模板 | `style` | `<persona>` 人格 |
| 任务、任务模板 | `format` | `<task_template>`（任务结构） |
| 标题、标题套路 | `format` | **不**进 `<task_template>`；标题套路正文单独通过 `titlePatternContent` 进入 `<title_guide>` 等 |

**标题模版类识别**：类别名 ∈ {标题套路, 标题} **或** `sort_order === 6`（`isTitlePatternCategoryRow`）。用于：前端区分标题行、服务端 `loadTitlePatternContent` 校验、`buildSystemPrompt` 中把 `format` 里的标题类从 `taskFormats` 剔除。

---

## 三、内容创作页：用户操作顺序

1. **输入需求**（多行文本）。
2. **任务解析**：点击「任务解析」→ `POST /api/ai/detect-intent`，body：`{ user_input }`。
3. **意图推荐**：服务端拉取全部文档的 **元数据**（id、title、category、tags、`role` 已由 `resolvePromptDocRole` 解析），拼成清单，Claude 调用工具 `recommend_docs` 返回 `suggested_docs`。
4. **前端**：按类别去重（每类最多一篇推荐），写入 `selectedDocs` / `selectedDocIds`；用户可在 **「AI 将使用」** 各下拉中改选。
5. **标题模版**：单独字段 `title_pattern_doc_id`；默认自动选标题类下文档（如存在「默认标题套路」则优先）。
6. **正文长度**：短 / 中 / 长 → `article_length`。
7. **人格浓度**：默认 **62（「深」）**，对应 `DEFAULT_PERSONA_INTENSITY`；四档 UI 来自 `PERSONA_SOUL_TIERS`。
8. **生成正文**：`POST /api/ai/generate`，`phase: "body"`（主路径为「先正文流式，再同轮或补请求出标题」）。

模版选择区 **默认始终展示**，不依赖是否已点「任务解析」；但未选文档时 `selected_doc_ids` 可能为空，生成质量依赖用户后续选择。

---

## 四、`/api/ai/generate`：请求体与阶段

### 4.1 常用字段

| 字段 | 作用 |
|------|------|
| `selected_doc_ids` | 参与 Prompt 的文档 ID 列表（**仅这些**会 `loadPromptDocs` 拉全文） |
| `user_input` | 进入用户消息的「=== 用户需求 ===」 |
| `title_pattern_doc_id` | 标题套路文档 ID；校验通过后全文进入 `titlePatternContent` |
| `article_length` | `short` \| `medium` \| `long` |
| `persona_intensity` | 0–100 |
| `phase` | `body` \| `titles` \| `full` |
| `body_text` | `phase === "titles"` 时必填：已生成正文，用于只生成标题 |
| `selected_title` | 若已选标题再写正文时使用（`body_only` 模式） |

### 4.2 阶段行为（摘要）

- **`body`（未带 `selected_title`）**：`buildSystemPrompt` 的 `mode: body_first`：流式输出正文，并尝试在同一次对话末尾通过工具 `output_titles` 产出标题 JSON；流末尾可带 `GNN_TITLES_MARKER` + JSON 供前端解析。
- **`body` + `selected_title`**：`mode: body_only`，只流式正文。
- **`titles`**：根据 `body_text` 与 `titlePatternContent` 等生成标题工具结果（用于流式失败时的补请求）。
- **`full`**：兼容一步生成；若存在标题套路内容可走结构化 tool。

### 4.3 联网搜索

任选一文档的 `title` 或 `content` 含「联网搜索」时，会为 Claude 打开 `web_search` 工具（具体以 `generate/route.ts` 为准）。

---

## 五、`buildSystemPrompt`：拼装结构（`src/lib/prompt-templates.ts`）

顺序概览：

1. **LAYER_0_BASE**：身份、禁止元叙述、零 Markdown、emoji 节奏等全局规则。
2. **`<brand_rules>`**：`role === constraint`，按 `priority` 降序；每篇 `### 类别名 · 标题\n正文`。
3. **`<knowledge>`**：`role === reference`；**全文 `trim` 拼接**，提示为「按需取用」。
4. **`<persona>`**：有人格文档或浓度 > 25 时出现；人格正文 + 浓度对应指令（`personaIntensityInstruction` 在 `copy-generate-options.ts`）。
5. **`<task_template>`**：`role === format` 且 **类别名不是标题模版类**（`!isTitlePatternCategoryName`）。
6. **按 `mode` 追加**：`<output_spec>`、`<title_guide>`、`<length_control>` 等；标题套路正文注入 `titlePatternContent` 相关段落。

用户消息侧：**用户需求**（及可选「已写正文」「选定标题」）在 **user 消息**中，避免与 system 重复堆叠。

---

## 六、自动读取（`is_auto_include`）与内容创作的关系

- **内容工厂**中类别可勾选「AI 生成时自动读取该类别下所有文档」→ `is_auto_include`。
- **Pitch、排期脚本/排期表、推荐主题等**接口会查询 `is_auto_include = true` 的类别，再拉取这些类别下**全部** `docs` 拼进 Prompt（常带 `slice` 限制长度）。
- **`/api/ai/generate`（内容创作）不会**根据 `is_auto_include` 自动合并文档；只使用 **`selected_doc_ids` + `title_pattern_doc_id`**。

---

## 七、意图分析 Prompt 规则（摘录）

`DETECT_INTENT_SYSTEM`（`prompt-templates.ts`）约定模型按 `role` 推荐：

- `constraint`：涉及品牌则必选  
- `format`：任务类型，最多 1 篇（任务模板类）  
- `style`：人格，最多 1 篇  
- `reference`：知识库 0–3 篇  

列表中的 `role` 已按 **类别名硬编码** 解析，与生成阶段一致。

---

## 八、关键文件索引

| 路径 | 说明 |
|------|------|
| `src/components/copywriter/CopywriterClient.tsx` | 内容创作 UI 与请求编排 |
| `src/app/api/ai/generate/route.ts` | 生成 API、拉文档、标题套路校验 |
| `src/app/api/ai/detect-intent/route.ts` | 意图分析 |
| `src/lib/prompt-templates.ts` | System Prompt 拼装与意图/工具定义 |
| `src/lib/copy-generate-options.ts` | 篇幅、人格浓度默认与说明文案 |
| `src/lib/doc-category-constants.ts` | 类别名→角色、标题类识别 |
| `src/lib/copy-stream-titles.ts` / `parse-title-variants.ts` | 流式正文与标题解析 |
| `src/components/documents/ContentFactoryClient.tsx` | 内容工厂、含 `is_auto_include` 开关 |
| `supabase/migrations/012_doc_categories_and_docs.sql` | 类别与 docs 表初版 |
| `supabase/migrations/020_title_pattern_category.sql` | 标题套路类别与默认文档 |
| `supabase/migrations/030_docs_add_role.sql` | `docs.role`、`priority` |

---

## 九、维护时注意点

1. **新增类别名**：若需固定进某 Prompt 区块，在 `doc-category-constants.ts` 中补充映射；否则依赖 `docs.role` 与校验约束。
2. **知识库长文**：当前生成路径**不截断** reference 全文；超长时可能占满上下文，需产品或后续加 `slice`/RAG。
3. **标题类改名**：只要名称命中「标题」「标题套路」或 `sort_order=6`，与服务端 `loadTitlePatternContent`、前端 `resolvedTitlePatternCategory` 保持一致即可。

文档版本：与仓库提交同步维护；若行为变更请更新本节与「关键文件」表。
