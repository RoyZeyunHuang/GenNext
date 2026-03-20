-- Add AI one-line summary and outreach email-interaction flags

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS ai_summary text;

CREATE INDEX IF NOT EXISTS idx_emails_gmail_message_id ON emails(gmail_message_id);

ALTER TABLE outreach
  ADD COLUMN IF NOT EXISTS ai_summary text;

ALTER TABLE outreach
  ADD COLUMN IF NOT EXISTS needs_attention boolean DEFAULT false;

ALTER TABLE outreach
  ADD COLUMN IF NOT EXISTS last_email_at timestamptz;

-- helpful for Kanban filters
CREATE INDEX IF NOT EXISTS idx_outreach_needs_attention ON outreach(needs_attention);

