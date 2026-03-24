-- Ensure outreach.needs_attention exists (019 may not have been applied on some projects)
ALTER TABLE outreach
  ADD COLUMN IF NOT EXISTS needs_attention boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_outreach_needs_attention ON outreach(needs_attention);
