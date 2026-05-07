# email-campaigns skill — 用法 & 部署

> Skill 本身的规则在 [SKILL.md](./SKILL.md);这份文档面向**使用者**(你),讲怎么装、怎么用、出问题怎么排查。

---

## 整体架构

```
┌─────────────────────┐         ┌──────────────────┐
│ Claude Code (skill) │  写库   │   Supabase       │  读库   ┌──────────────────┐
│  你跟 Claude 聊天   │ ──────> │  email_campaigns │ <────── │ Mac worker (常驻) │
│  规划 / 暂停 / 查询 │         │  emails(scheduled│         │  60s 扫一次,发信 │
└─────────────────────┘         │   /sent/failed)  │         │  写回状态        │
                                └──────────────────┘         └──────────────────┘
                                          ▲
                                          │ webhook
                                  ┌───────┴────────┐
                                  │ Resend (SMTP)  │
                                  │ delivered/open │
                                  │ /bounce 回调   │
                                  └────────────────┘
```

三件东西**互相独立**,挂掉任一台不会影响其他:
- **Skill** 只在你跟 Claude 聊天时活着,负责把意图写进 DB
- **Worker** 是常驻 Node 进程,只读 DB 发信
- **Supabase** 是唯一的真相源

---

## 全新机器初始化(从零开始)

### 1. 把代码拉下来

```bash
git clone <repo-url> GenNext
cd GenNext
npm install
```

### 2. 配置 `.env.local`

复制 `.env.example` 为 `.env.local`,至少填以下几项:

```bash
# 必填
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # Dashboard → Settings → API
RESEND_API_KEY=re_...
SENDER_EMAIL=invo.mrkt@nystudents.net
ANTHROPIC_API_KEY=sk-ant-...        # skill 不需要,但项目其他地方用

# 可选(已经有默认)
RESEND_FROM_NAME=INVO by USWOO
DEFAULT_CC_EMAIL=
DEFAULT_BCC_EMAIL=

# 仅 worker 调试用
# WORKER_TICK_MS=60000               # 主循环间隔
# WORKER_BATCH_SIZE=10               # 每次最多取 N 条
# WORKER_MAX_ATTEMPTS=3              # 单封信最多重试次数
# WORKER_HEALTHCHECK_URL=https://hc-ping.com/xxx-uuid  # 监控 URL,worker 每 tick 后 ping 一次
```

### 3. Supabase migration(全局只跑一次,任何机器都共享同一个 DB)

如果是全新 Supabase 项目:

```bash
SUPABASE_DB_URL='postgresql://postgres.[ref]:[PASSWORD]@aws-0-...pooler.supabase.com:6543/postgres' \
  node scripts/apply-sql-migration.mjs supabase/migrations/059_email_campaigns.sql
```

或者直接 Dashboard → SQL Editor 粘贴 [supabase/migrations/059_email_campaigns.sql](../../../supabase/migrations/059_email_campaigns.sql) 跑。

**migration 已经在某台机器上跑过的话,新机器跳过这一步**。

### 4. 装 worker(只在"常驻不关机"的那台 Mac 上装一次)

```bash
./apps/email-worker/install-launchd.sh
tail -f /tmp/gennext-email-worker.log
# 应该看到: [hostname-pid-uuid] 启动 (tick=60000ms batch=10 maxAttempts=3)
```

**别在多台机器同时装 worker**——虽然 `claim_due_emails` RPC 用 `FOR UPDATE SKIP LOCKED` 防止重发,但只装一台更省事、更省 Resend 配额。

卸载:`./apps/email-worker/install-launchd.sh --uninstall`

### 5. 让 skill 可用

skill 在 `.claude/skills/email-campaigns/`,**只要你 `cd GenNext` 启动 Claude Code,它会自动加载**——不需要任何额外配置。

---

## 日常用法(典型对话)

### 创建一个 campaign

> **你**: 给西区的开发商,从明天工作日早 10 点开始,每天 3 封间隔 30 分钟,用 INVO Established Buildings 模板,挑 8 家最近 30 天没联系过的

Claude 会:
1. `list-companies --area "west" --not-contacted-days 30 --has-email --limit 8` 拉候选
2. 给你看候选名单 → **等你确认**
3. `list-templates` 找模板 id → 或你直接说"用 Established"
4. `preview-campaign --template <id> --contacts <id1,id2,...> --schedule '{...}' --name "West-Side Pitch 2026-05"` 渲染预览
5. 给你看完整时间表 + 渲染后的第一封 subject/body 节选 → **等你确认**
6. `create-campaign ... --confirm` 写库

### 查进度

> **你**: 那个西区 campaign 进度怎么样?

Claude 调 `list-campaigns` → 找到你说的那个 → `campaign-status <id>`,把统计 / 待发 top 10 / 失败 top 10 / 同期收到的回复 给你看。

### 暂停 / 恢复 / 取消

> **你**: 暂停西区那个 campaign(或 资源 / 取消)

| 操作 | 工具 | 后果 |
|---|---|---|
| 暂停 | `pause-campaign <id>` | worker 跳过这批待发,数据保留,可恢复 |
| 恢复 | `resume-campaign <id>` | 恢复发送 |
| 取消 | `cancel-campaign <id> --confirm` | **不可逆**。所有未发 emails → cancelled |

### 看模板里有哪些占位符

> **你**: 那两套 INVO 模板长什么样?

Claude 调 `list-templates` 列出每个模板的 placeholders(`{{contact_name}}` / `{{property_name}}` / `{{cities_two}}` 等)和 body 节选。

---

## 命令行直接调(不通过 Claude)

任何 skill 工具都能直接命令行跑(便于调试):

```bash
# 列模板
node --env-file=.env.local .claude/skills/email-campaigns/tools/list-templates.mjs

# 列候选公司
node --env-file=.env.local .claude/skills/email-campaigns/tools/list-companies.mjs \
  --area "Brooklyn" --not-contacted-days 30 --has-email --limit 10

# 预览(不写库)
node --env-file=.env.local .claude/skills/email-campaigns/tools/preview-campaign.mjs \
  --template <template_id> \
  --contacts <id1,id2,id3> \
  --schedule '{"start_at":"2026-05-08T10:00:00-04:00","per_day":3,"interval_minutes":30,"weekdays_only":true,"daily_window":{"start_hour":10,"end_hour":17,"tz":"America/New_York"}}' \
  --name "Test"

# 真创建(必须 --confirm)
node --env-file=.env.local .claude/skills/email-campaigns/tools/create-campaign.mjs \
  --template <template_id> --contacts <id1,id2,id3> \
  --schedule '...' --name "Test" --confirm

# 进度
node --env-file=.env.local .claude/skills/email-campaigns/tools/campaign-status.mjs <campaign_id>
```

所有工具用 stdout 输出 JSON,失败时 exit 非 0 + stderr 写错误。

---

## schedule spec 字段

```json
{
  "start_at": "2026-05-08T10:00:00-04:00",
  "per_day": 3,
  "interval_minutes": 30,
  "weekdays_only": true,
  "daily_window": {
    "start_hour": 10,
    "end_hour": 17,
    "tz": "America/New_York"
  }
}
```

| 字段 | 说明 |
|---|---|
| `start_at` | 第一封信发送时间(ISO 8601 with offset)。**周末时若 weekdays_only=true 自动顺延到下周一 start_hour** |
| `per_day` | 每日上限。超过则顺延到下一可用日 |
| `interval_minutes` | 同日内两封间隔(分钟) |
| `weekdays_only` | true=跳过周六周日 |
| `daily_window.start_hour` / `end_hour` | 每日允许发送时段(0-23,end_hour 不含) |
| `daily_window.tz` | IANA 时区。算法按这个时区判断"哪天"和"几点" |

contacts 数组**按数组顺序**逐一分配 scheduled_at。

---

## 跟现有系统的关系

- 每发一封信,worker 自动调 outreach 同步逻辑(等同 `src/lib/outreach-after-send.ts`):若 outreach 不存在则创建 stage='Pitched';若已存在且 stage='Not Started' 则推进到 'Pitched';更新 `last_email_at`
- 现有 CRM `emails` 列表(`/api/email/route.ts`)会自动显示 scheduled 行——你能在前端看到"未来要发的信"
- 现有 `/api/webhook/resend` 仍然处理 delivered / opened / bounced 事件,把 status 进一步推进
- AI pitch 生成 / AI reply 生成 / latest_sent_email_status / check-bounces 这几处已经过滤掉 scheduled 行,不会污染统计或 AI 上下文(详见 migration 上线时同改的几个 `/api/...` 文件)

---

## 故障排查

### 我创建了 campaign 但没收到信

按这个顺序排查:

1. **worker 在跑吗?**
   ```bash
   launchctl list | grep com.gennext.email-worker
   tail -f /tmp/gennext-email-worker.log    # 应每 60s 至少有一次 tick
   tail -f /tmp/gennext-email-worker.err    # 看有无报错
   ```
2. **scheduled_at 到了吗?**
   ```bash
   node --env-file=.env.local .claude/skills/email-campaigns/tools/campaign-status.mjs <id>
   # upcoming 列表里看 scheduled_at < now()
   ```
3. **campaign 是 active 吗?**
   - `list-campaigns` 看 status。paused/cancelled 都不会发
4. **last_error 有啥**
   - `campaign-status` 输出里 `failures` 段。常见: Resend API key 失效 / SENDER_EMAIL 未在 Resend 验证 / to_email 格式错

### worker 跑着跑着不动了

```bash
# 1. 看日志,SIGTERM/SIGINT/异常?
tail -100 /tmp/gennext-email-worker.err

# 2. 重启
./apps/email-worker/install-launchd.sh    # reload 同一份 plist
```

worker 挂掉时锁住的 emails(status='sending')会在 5 分钟后自动被 `reclaim_stuck_emails` 重置回 scheduled,不会丢。

### 不小心 create 错了想撤

```bash
# 立刻取消(不可逆)
node --env-file=.env.local .claude/skills/email-campaigns/tools/cancel-campaign.mjs <id> --confirm

# 或者只是先暂停看看
node --env-file=.env.local .claude/skills/email-campaigns/tools/pause-campaign.mjs <id>
```

只要 worker 还没把行 status 从 'scheduled' 改成 'sending',就来得及。

### 模板改了,已 scheduled 的信会用新模板吗

**不会**。skill 在 create 时把 subject/body/HTML 全渲染好写进 `emails.body`,worker 不再做替换。改模板**只影响未来 create 的 campaign**。

### Resend 退信 / 收件人无效

`/api/webhook/resend` 收到 bounce 事件会自动把对应 email 行 status 改成 'bounced'。outreach 那边也会同步标 needs_attention。skill 这边目前不会因为 bounce 自动停发 campaign 后续——如果某个域名整体退信,你需要手动暂停 campaign 或在 contacts 里把那批 email 清掉。

---

## 跟现有 BatchEmailModal 的区别

| 场景 | 用什么 |
|---|---|
| **临时一次性发**:CRM 里勾几家公司,马上发 | BatchEmailModal(CRM UI) |
| **定时/批量/分天**:N 家公司分散在几天发,有节奏 | 这个 skill |
| **AI 个性化每封**:每封信都让 AI 单独写 | `/api/ai/generate-pitch` + BatchEmailModal previews |
| **常驻自动跑**:不需要每次手动点发 | 这个 skill + worker |

两条路用同一套 `emails` / `outreach` / `email_templates` 表,数据完全互通,在哪条路发的信另一条路都能看到。

---

## 编辑 skill 自身

skill 的所有逻辑都在 `.claude/skills/email-campaigns/`:

```
SKILL.md                    给 Claude 看的"何时用、怎么调用工具"
USAGE.md                    给你看的(本文件)
lib/db.mjs                  Supabase 客户端 + 命令行参数解析
lib/render.mjs              模板渲染 + INVO HTML 包装(改视觉时同步改 src/lib/email-template.ts)
lib/schedule.mjs            时区感知调度算法
tools/*.mjs                 9 个命令行工具
```

直接改文件就行,Claude Code 下次启动会自动 reload。
