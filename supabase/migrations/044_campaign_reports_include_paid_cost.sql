-- Campaign KPI：是否展示从 xhs_paid_daily 汇总的投放成本
ALTER TABLE campaign_reports
  ADD COLUMN IF NOT EXISTS include_paid_cost boolean NOT NULL DEFAULT false;
