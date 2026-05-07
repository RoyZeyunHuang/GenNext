-- Email Campaigns: 让 emails 表既能记录"已发生"的邮件,也能记录"未来要发"的邮件
--
-- 设计要点:
--   * 复用现有 emails 表(增加 scheduled_at / campaign_id / template_id / contact_id /
--     attempts / last_error 列),不引入并行的 jobs 表
--   * status 值域扩展: 'scheduled' / 'sending' / 'failed' / 'cancelled'
--     (原有: 'sent' / 'delivered' / 'opened' / 'bounced' / null)
--   * 新增 email_campaigns 表,只是为了把一组 jobs 归类、便于"暂停整批"
--   * worker 只关心 emails where status='scheduled' and scheduled_at <= now()

-- ============================================================
-- 1. emails 表扩列
-- ============================================================
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_id  uuid,
  ADD COLUMN IF NOT EXISTS template_id  uuid,
  ADD COLUMN IF NOT EXISTS contact_id   uuid,
  ADD COLUMN IF NOT EXISTS attempts     int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error   text,
  ADD COLUMN IF NOT EXISTS sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by    text;

-- 已有 created_at 作为"插入时间";新增的 sent_at 表示"实际发出时间"
-- (历史行没有 sent_at,前端展示时若 sent_at 为空 fall back 到 created_at)

-- 给历史已发邮件回填 sent_at = created_at(便于之后统一查询)
UPDATE emails
SET sent_at = created_at
WHERE sent_at IS NULL
  AND status IN ('sent', 'delivered', 'opened', 'bounced');

-- ============================================================
-- 2. email_campaigns 表
-- ============================================================
CREATE TABLE IF NOT EXISTS email_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'active',
    -- active / paused / done / cancelled
  notes       text,
    -- skill 创建时记录"自然语言计划描述",留痕
  created_by  text,
    -- 记录是哪个 skill / 用户创建,默认 'skill:email-campaigns'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on email_campaigns"
  ON email_campaigns FOR ALL USING (true) WITH CHECK (true);

-- 现在补上 emails.campaign_id 的外键
ALTER TABLE emails
  ADD CONSTRAINT emails_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL
  NOT VALID;
ALTER TABLE emails VALIDATE CONSTRAINT emails_campaign_id_fkey;

-- emails.template_id / contact_id 也补上外键(SET NULL,模板被删不影响历史邮件)
ALTER TABLE emails
  ADD CONSTRAINT emails_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL
  NOT VALID;
ALTER TABLE emails VALIDATE CONSTRAINT emails_template_id_fkey;

ALTER TABLE emails
  ADD CONSTRAINT emails_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
  NOT VALID;
ALTER TABLE emails VALIDATE CONSTRAINT emails_contact_id_fkey;

-- ============================================================
-- 3. 关键索引
-- ============================================================

-- worker 主循环:扫"到点未发"
CREATE INDEX IF NOT EXISTS idx_emails_due
  ON emails (scheduled_at)
  WHERE status = 'scheduled';

-- 按 campaign 查 / 暂停整批
CREATE INDEX IF NOT EXISTS idx_emails_campaign
  ON emails (campaign_id)
  WHERE campaign_id IS NOT NULL;

-- 防卡死:扫"卡在 sending 状态超过 N 分钟"的行,重置回 scheduled
CREATE INDEX IF NOT EXISTS idx_emails_sending_locked
  ON emails (locked_at)
  WHERE status = 'sending';

-- ============================================================
-- 4. updated_at 触发器(email_campaigns)
-- ============================================================
CREATE OR REPLACE FUNCTION email_campaigns_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_campaigns_updated_at ON email_campaigns;
CREATE TRIGGER trg_email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION email_campaigns_set_updated_at();

-- ============================================================
-- 5. 批量取/锁 RPC:worker 一次拿 N 行并原子锁定,避免多 worker 抢
-- ============================================================
CREATE OR REPLACE FUNCTION claim_due_emails(
  p_worker_id text,
  p_limit     int DEFAULT 10
)
RETURNS SETOF emails
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE emails
  SET status     = 'sending',
      locked_at  = now(),
      locked_by  = p_worker_id,
      attempts   = attempts + 1
  WHERE id IN (
    SELECT id FROM emails
    WHERE status = 'scheduled'
      AND scheduled_at <= now()
      AND (
        campaign_id IS NULL
        OR campaign_id IN (
          SELECT id FROM email_campaigns WHERE status = 'active'
        )
      )
    ORDER BY scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ============================================================
-- 6. 回收卡死 RPC:把 status='sending' 但锁定超过 N 分钟的行重置回 scheduled
-- ============================================================
CREATE OR REPLACE FUNCTION reclaim_stuck_emails(p_stuck_minutes int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  WITH reclaimed AS (
    UPDATE emails
    SET status    = 'scheduled',
        locked_at = NULL,
        locked_by = NULL
    WHERE status = 'sending'
      AND locked_at < now() - (p_stuck_minutes || ' minutes')::interval
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reclaimed;
  RETURN v_count;
END;
$$;
