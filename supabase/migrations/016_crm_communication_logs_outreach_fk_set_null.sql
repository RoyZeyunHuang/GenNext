-- Keep communication logs when outreach is deleted.
-- Convert outreach_id FK from ON DELETE CASCADE to ON DELETE SET NULL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'communication_logs'
      AND tc.constraint_name = 'communication_logs_outreach_id_fkey'
  ) THEN
    ALTER TABLE communication_logs
      DROP CONSTRAINT communication_logs_outreach_id_fkey;
  END IF;
END $$;

ALTER TABLE communication_logs
  ADD CONSTRAINT communication_logs_outreach_id_fkey
  FOREIGN KEY (outreach_id) REFERENCES outreach(id)
  ON DELETE SET NULL;

