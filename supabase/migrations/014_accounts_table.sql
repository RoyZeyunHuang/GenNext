CREATE TABLE accounts (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  platform text default '小红书',
  color text,
  notes text,
  source text default 'manual',
  created_at timestamptz default now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on accounts" ON accounts FOR ALL USING (true) WITH CHECK (true);

-- 从投放数据自动导入已有账号（若表存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'xhs_paid_daily') THEN
    INSERT INTO accounts (name, source)
    SELECT DISTINCT creator, 'auto_import'
    FROM xhs_paid_daily
    WHERE creator IS NOT NULL AND trim(creator) != ''
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;
