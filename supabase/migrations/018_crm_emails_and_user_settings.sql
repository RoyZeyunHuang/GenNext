-- CRM emails + templates + app settings (Gmail OAuth token storage)

CREATE TABLE IF NOT EXISTS emails (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  direction text not null,
  from_email text,
  to_email text,
  subject text,
  body text,
  status text default 'sent',
  resend_id text,
  gmail_message_id text,
  opened_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_emails_company ON emails(company_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);
CREATE INDEX IF NOT EXISTS idx_emails_resend_id ON emails(resend_id);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on emails" ON emails FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on email_templates" ON email_templates FOR ALL USING (true) WITH CHECK (true);

INSERT INTO email_templates (name, subject, body)
SELECT 'Default Pitch', 'Partnership Opportunity — {{company_name}}', 'Hi {{contact_name}},

I am reaching out regarding a potential partnership opportunity with {{company_name}} for {{property_name}}.

We specialize in connecting qualified renters with premium properties in the NYC area through our social media marketing channels.

Would you be open to a brief call this week to discuss how we might work together?

Best regards'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'Default Pitch');

CREATE TABLE IF NOT EXISTS user_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on user_settings" ON user_settings FOR ALL USING (true) WITH CHECK (true);
