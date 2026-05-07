---
name: email-campaigns
description: 安排、定时、批量发 INVO pitch 邮件。用户用自然语言描述意图(选谁 / 用哪个模板 / 什么节奏),skill 翻译成 Supabase 里的 email_campaigns + emails(status='scheduled') 行,Mac 上的 worker 进程定时取走发出。也能查进度、暂停、取消、回看历史。
---

# Email Campaigns Skill

把"用自然语言描述的发信计划"翻译成 Supabase 数据库里结构化的待发任务。**自己不发信**——发信由独立的 `apps/email-worker/` 进程负责。这层职责分离是设计上的硬约束。

## 何时使用

用户说类似的话就该启用:
- "给西区这批联系人下周一开始每天早 10 点发 3 封 follow-up"
- "把 X 公司的所有联系人加到 Established Buildings 模板的发送队列"
- "上周二那批 pitch 发出去多少了?"
- "暂停 Spring 2026 那个 campaign"

不用于:
- 单封临时邮件 — 用 CRM UI 里的 BatchEmailModal
- 修改模板内容 — 直接改 `email_templates` 表
- 处理收件回复 — Gmail sync 路径已经在做了

## 工作流

**典型一次对话**:

1. **理解意图** — 问清楚:**谁**(联系人筛选条件) / **用哪个模板** / **什么节奏**(开始时间、每天几封、工作日 only?、send window)
2. **列候选** — 调 `list-companies` 或 `list-contacts` 工具确认目标人群
3. **预览** — 调 `preview-campaign` 看 skill 会写哪些行(包括渲染后的 subject / body 节选 / scheduled_at 时间表),发给用户确认
4. **写入** — 用户明确确认后,调 `create-campaign --confirm` 落库
5. **告知** — 说清楚 campaign id、首封发件时间、worker 怎么知道

**关键原则**: 永远先 preview 再 create。preview 不写库,create 写库。**不允许跳过 preview 直接 create**,即使用户说"快点"。

## 工具

所有工具在 `tools/` 目录下,都是 mjs 脚本。统一调用方式:

```bash
node --env-file=.env.local .claude/skills/email-campaigns/tools/<tool>.mjs [args...]
```

工具列表:

| 工具 | 用途 |
|---|---|
| `list-templates.mjs` | 列出可用 email_templates,返回 id / name / 模板里识别到的 {{vars}} |
| `list-companies.mjs --area <area> --not-contacted-days <n>` | 列候选公司(带主联系人邮箱),可按区域 / 上次联系时间过滤 |
| `list-contacts.mjs --company <id>` 或 `--ids <id,id>` | 直接拉联系人详情 |
| `preview-campaign.mjs --template <id> --contacts <ids> --schedule '<json>' [--name <name>]` | 渲染并返回 N 行待写入预览,**不写库** |
| `create-campaign.mjs --template <id> --contacts <ids> --schedule '<json>' --name <name> --notes <text> --confirm` | 真写库。campaign + N 个 scheduled emails |
| `list-campaigns.mjs [--status active]` | 所有 campaign + 进度统计 |
| `campaign-status.mjs <campaign_id>` | 单个 campaign 的详细进度(已发 / 待发 / 失败 / 最近错误 / 最近回复) |
| `pause-campaign.mjs <campaign_id>` | 改 active → paused,worker 跳过这批 |
| `resume-campaign.mjs <campaign_id>` | 改回 active |
| `cancel-campaign.mjs <campaign_id>` | 不可逆。campaign cancelled,所有未发 emails 标 cancelled |

工具用 stdout 输出 JSON。失败时退出码非 0 + stderr 写错误,不要在 stdout 混入非 JSON 文本。

## 调度 spec

`--schedule` 接 JSON 字符串,字段:

```json
{
  "start_at": "2026-05-11T10:00:00-04:00",
  "per_day": 3,
  "interval_minutes": 30,
  "weekdays_only": true,
  "daily_window": { "start_hour": 10, "end_hour": 17, "tz": "America/New_York" }
}
```

- `start_at`: 第一封信发送时间(ISO 8601 with offset)
- `per_day`: 每日上限(超过则顺延到下一可用日)
- `interval_minutes`: 同日内两封间隔
- `weekdays_only`: 跳过周六周日
- `daily_window`: 每日允许发送的时段(超出则顺延到次日 start_hour)

对 contacts 数组**按数组顺序**逐一分配 scheduled_at。skill 在 preview 时把分配结果完整列出来给用户看。

## 模板渲染

skill 在 schedule 时一次性渲染所有 subject + body + HTML 包装,**写进 emails 表**。worker 看到的是已渲染的最终字符串,不会再做二次替换。

支持的占位符(参考 `src/lib/email-helpers.ts` 的语义):
- `{{contact_name}}` — 联系人 first name(含 fallback "there")
- `{{property_name}}` — 关联楼盘名(单楼) / "A and B" 列举(多楼)
- `{{cities_two}}` — 关联楼盘的两个不同 neighborhood
- `{{neighborhood}}` — 同 cities_two,兼容老模板
- `{{company_name}}` — 公司名
- `{{company_role}}` — 公司在该楼盘的角色

如果某个 contact 缺关键变量(没有关联楼盘),preview 会标红跳过,不会进 create-campaign。

## 风险与防呆

- **永不发空 to_email**:create-campaign 自动跳过 contact 没有 email 的行
- **永不重发同一封**:如果 emails 表已有 (contact_id, campaign_id) 重复行,create-campaign 报错退出
- **冷却期**:create-campaign 默认拒绝向"7 天内已联系过"的联系人发信(看 outreach.last_email_at);用 `--ignore-cooldown` 强制覆盖
- **worker 必须在跑**:每次 create 后提醒用户检查 `tail -f /tmp/gennext-email-worker.log`,确认 worker 健康

## 失败/异常时怎么办

- worker 单次发送失败 → emails.last_error 有错误,自动重试(最多 3 次,attempts 累加),在 campaign-status 里能看到
- worker 进程挂了 → emails 卡在 status='sending',5 分钟后被 reclaim_stuck_emails 自动恢复成 scheduled
- 用户改主意了 → pause-campaign(可恢复)或 cancel-campaign(不可逆)
- 模板被改了 → **不影响已 scheduled 的 emails**(身体已 frozen),只影响未来 create 的 campaign

## 跟现有系统的关系

- 复用 `companies` / `contacts` / `properties` / `property_companies` / `outreach` / `email_templates` / `emails` 表(详见 `supabase/migrations/059_email_campaigns.sql`)
- 新增 `email_campaigns` 表只是为了"按批归类 + 暂停整批"
- worker 发完一封信会写 `emails.status='sent'` + 调用 outreach 同步逻辑(同 `src/lib/outreach-after-send.ts`),前端 CRM 各页面看到的 outreach 状态一致更新
- Resend webhook(`/api/webhook/resend`)仍然处理 delivered / opened / bounced 事件,把 status 进一步推进
