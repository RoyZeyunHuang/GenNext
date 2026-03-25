-- 修正 xhs_notes_with_publish_date 视图的日期解析正则
-- 旧正则 \d{2}月\d{2}日 只匹配两位数月/日，
-- XHS 实际存储 "2026年1月5日" 这种单位数格式导致 publish_date 全为 NULL
-- 改为 \d{1,2} 以兼容单位数和双位数月/日

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
    -- 中文格式：2026年1月5日 / 2026年01月05日
    WHEN publish_time IS NOT NULL
      AND publish_time::text ~ '^\d{4}年\d{1,2}月\d{1,2}日'
    THEN (
      REGEXP_REPLACE(
        publish_time::text,
        '^(\d{4})年(\d{1,2})月(\d{1,2})日.*',
        '\1-\2-\3'
      )
    )::date
    -- ISO / 其他 ≥10 字符格式：2026-01-05
    WHEN publish_time IS NOT NULL
      AND length(publish_time::text) >= 10
    THEN (substring(publish_time::text FROM 1 FOR 10))::date
    ELSE NULL
  END AS publish_date
FROM xhs_notes;

GRANT SELECT ON xhs_notes_with_publish_date TO anon;
