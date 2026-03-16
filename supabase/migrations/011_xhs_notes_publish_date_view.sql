-- 为 KPI 筛选提供 publish_time 解析为日期的视图，满足「snapshot_date 与 publish_time 均在日期范围内」的查询
CREATE OR REPLACE VIEW xhs_notes_with_publish_date
WITH (security_invoker = true)
AS
SELECT
  id,
  snapshot_date,
  title,
  publish_time,
  genre,
  exposure,
  views,
  cover_ctr,
  likes,
  comments,
  collects,
  follows,
  shares,
  avg_watch_time,
  danmaku,
  content_type,
  is_paid,
  note_id,
  created_at,
  CASE
    WHEN publish_time IS NOT NULL AND publish_time::text ~ '^\d{4}年\d{2}月\d{2}日'
    THEN TO_DATE(
      REGEXP_REPLACE(publish_time::text, '(\d{4})年(\d{2})月(\d{2})日.*', '\1-\2-\3'),
      'YYYY-MM-DD'
    )
    WHEN publish_time IS NOT NULL AND length(publish_time::text) >= 10
    THEN (substring(publish_time::text from 1 for 10))::date
    ELSE NULL
  END AS publish_date
FROM xhs_notes;

GRANT SELECT ON xhs_notes_with_publish_date TO anon;
