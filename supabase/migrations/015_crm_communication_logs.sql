-- CRM: communication_logs for BD tracking timeline
CREATE TABLE IF NOT EXISTS communication_logs (
  id uuid default gen_random_uuid() primary key,
  property_id uuid references properties(id) on delete cascade,
  outreach_id uuid references outreach(id) on delete cascade,
  date date default current_date,
  channel text,
  content text,
  next_action text,
  created_at timestamptz default now()
);
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on communication_logs" ON communication_logs FOR ALL USING (true) WITH CHECK (true);
