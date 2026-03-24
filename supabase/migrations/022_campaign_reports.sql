-- 009_kpi_xhs_notes_paid_daily 曾 DROP campaign_reports；重建以支持 KPI Campaign 报告写入
CREATE TABLE IF NOT EXISTS campaign_reports (
  id text PRIMARY KEY,
  title text NOT NULL,
  summary text,
  date_from text NOT NULL,
  date_to text NOT NULL,
  aggregate_json text,
  top_posts_json text,
  created_at text NOT NULL
);

ALTER TABLE campaign_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon rw campaign_reports" ON campaign_reports;
CREATE POLICY "Allow anon rw campaign_reports" ON campaign_reports
  FOR ALL USING (true) WITH CHECK (true);
