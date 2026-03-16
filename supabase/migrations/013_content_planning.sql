-- 排期计划
CREATE TABLE content_plans (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date_from date not null,
  date_to date not null,
  theme text,
  hooks jsonb default '[]',
  strategy_notes text,
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 计划关联的账号
CREATE TABLE plan_accounts (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid not null references content_plans(id) on delete cascade,
  account_name text not null,
  hook_index int,
  persona_doc_id uuid references docs(id),
  persona_name text,
  color text,
  positioning text,
  sort_order int default 0,
  created_at timestamptz default now()
);

CREATE INDEX idx_plan_accounts_plan ON plan_accounts(plan_id);

-- 单条内容
CREATE TABLE content_items (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid not null references content_plans(id) on delete cascade,
  account_id uuid references plan_accounts(id) on delete set null,
  publish_date date not null,
  task_template_doc_id uuid references docs(id),
  brand_doc_ids uuid[],
  title text,
  brief text,
  script text,
  cover_idea text,
  comment_guide text,
  property_name text,
  content_type text default '视频',
  video_format text default '素材混剪',
  tags text[],
  status text default 'idea',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX idx_content_items_plan ON content_items(plan_id);
CREATE INDEX idx_content_items_date ON content_items(publish_date);
CREATE INDEX idx_content_items_account ON content_items(account_id);

ALTER TABLE content_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on content_plans" ON content_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on plan_accounts" ON plan_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on content_items" ON content_items FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION set_content_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER content_plans_updated_at
  BEFORE UPDATE ON content_plans
  FOR EACH ROW EXECUTE PROCEDURE set_content_plans_updated_at();

CREATE OR REPLACE FUNCTION set_content_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE PROCEDURE set_content_items_updated_at();
