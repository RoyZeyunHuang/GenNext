-- 为 xhs_paid_daily 添加命名唯一约束，供 upsert ON CONFLICT 使用
DROP INDEX IF EXISTS idx_xhs_paid_note_date;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'xhs_paid_daily'::regclass
      AND conname = 'xhs_paid_daily_note_id_event_date_key'
  ) THEN
    ALTER TABLE xhs_paid_daily
      ADD CONSTRAINT xhs_paid_daily_note_id_event_date_key UNIQUE (note_id, event_date);
  END IF;
END $$;
