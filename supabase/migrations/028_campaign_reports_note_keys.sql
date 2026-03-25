-- Campaign 报告可选：仅统计指定笔记（key = note_id 优先，否则 title，与 KPI 逻辑一致）
ALTER TABLE campaign_reports
  ADD COLUMN IF NOT EXISTS note_keys_json text;
