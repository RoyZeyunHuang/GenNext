-- Campaign 类型：投放 Campaign（笔记来自 xhs_paid_daily）vs 全量笔记 Campaign
ALTER TABLE campaign_reports
  ADD COLUMN IF NOT EXISTS is_paid_campaign boolean NOT NULL DEFAULT false;
