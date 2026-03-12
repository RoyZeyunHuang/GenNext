-- XHS / IG 相关表：与 import/app.db 结构对应，供 migrate-xhs-sqlite-to-supabase.js 迁移目标

-- 1. core_posts
CREATE TABLE IF NOT EXISTS core_posts (
  post_key text PRIMARY KEY,
  account_nickname text,
  account_xhs_id text,
  title text,
  cover_url text,
  link text,
  note_id text,
  content text,
  brand text,
  category text,
  note_type text,
  keywords text,
  publish_time text,
  title_norm text,
  link_norm text,
  publish_time_norm text,
  created_at text,
  updated_at text
);
ALTER TABLE core_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw core_posts" ON core_posts FOR ALL USING (true) WITH CHECK (true);

-- 2. dict_posts
CREATE TABLE IF NOT EXISTS dict_posts (
  dict_key text PRIMARY KEY,
  note_id text,
  link text,
  link_norm text,
  title text,
  title_norm text,
  cover_url text,
  account_nickname text,
  account_xhs_id text,
  content text,
  brand text,
  category text,
  note_type text,
  keywords text,
  publish_time text,
  updated_at text
);
ALTER TABLE dict_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw dict_posts" ON dict_posts FOR ALL USING (true) WITH CHECK (true);

-- 3. post_attributes
CREATE TABLE IF NOT EXISTS post_attributes (
  post_key text PRIMARY KEY,
  ae text,
  building text,
  updated_at text,
  updated_by text
);
ALTER TABLE post_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw post_attributes" ON post_attributes FOR ALL USING (true) WITH CHECK (true);

-- 4. paid_metrics_daily (主键 post_key, event_date)
CREATE TABLE IF NOT EXISTS paid_metrics_daily (
  post_key text NOT NULL,
  event_date text NOT NULL,
  spend real,
  impressions integer,
  clicks integer,
  ctr real,
  cpc real,
  cpm real,
  interactions integer,
  cpe real,
  play_5s integer,
  completion_5s real,
  new_seed integer,
  new_seed_cost real,
  new_deep_seed integer,
  new_deep_seed_cost real,
  dm_in integer,
  dm_open integer,
  dm_lead integer,
  dm_in_cost real,
  dm_open_cost real,
  dm_lead_cost real,
  shop_orders_15d integer,
  shop_order_cvr_15d real,
  shop_visits_15d integer,
  shop_visit_rate_15d real,
  run_id text,
  updated_at text,
  PRIMARY KEY (post_key, event_date)
);
ALTER TABLE paid_metrics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw paid_metrics_daily" ON paid_metrics_daily FOR ALL USING (true) WITH CHECK (true);

-- 5. xhs_post_metrics_snapshots (主键 post_key, snapshot_date)
CREATE TABLE IF NOT EXISTS xhs_post_metrics_snapshots (
  post_key text NOT NULL,
  snapshot_date text NOT NULL,
  genre text,
  exposure integer,
  views integer,
  cover_ctr real,
  likes integer,
  comments integer,
  collects integer,
  follows integer,
  shares integer,
  avg_watch_time real,
  danmaku integer,
  run_id text,
  updated_at text,
  PRIMARY KEY (post_key, snapshot_date)
);
ALTER TABLE xhs_post_metrics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw xhs_post_metrics_snapshots" ON xhs_post_metrics_snapshots FOR ALL USING (true) WITH CHECK (true);

-- 6. daily_top30_snapshot (主键 snapshot_date, post_key)
CREATE TABLE IF NOT EXISTS daily_top30_snapshot (
  snapshot_date text NOT NULL,
  post_key text NOT NULL,
  note_id text,
  account_nickname text,
  account_xhs_id text,
  views integer,
  likes integer,
  collects integer,
  comments integer,
  shares integer,
  run_id text,
  updated_at text,
  PRIMARY KEY (snapshot_date, post_key)
);
ALTER TABLE daily_top30_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw daily_top30_snapshot" ON daily_top30_snapshot FOR ALL USING (true) WITH CHECK (true);

-- 7. core_ig_posts
CREATE TABLE IF NOT EXISTS core_ig_posts (
  post_key text PRIMARY KEY,
  ig_post_id text,
  account_id text,
  account_username text,
  account_name text,
  description text,
  duration_sec integer,
  publish_time text,
  permalink text,
  post_type text,
  created_at text,
  updated_at text
);
ALTER TABLE core_ig_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw core_ig_posts" ON core_ig_posts FOR ALL USING (true) WITH CHECK (true);

-- 8. ig_post_metrics_snapshots (主键 post_key, snapshot_date)
CREATE TABLE IF NOT EXISTS ig_post_metrics_snapshots (
  post_key text NOT NULL,
  snapshot_date text NOT NULL,
  views integer,
  reach integer,
  likes integer,
  comments integer,
  saves integer,
  shares integer,
  follows integer,
  run_id text,
  updated_at text,
  PRIMARY KEY (post_key, snapshot_date)
);
ALTER TABLE ig_post_metrics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw ig_post_metrics_snapshots" ON ig_post_metrics_snapshots FOR ALL USING (true) WITH CHECK (true);

-- 9. kpi_registry
CREATE TABLE IF NOT EXISTS kpi_registry (
  kpi_key text PRIMARY KEY,
  group_key text,
  label text,
  enabled integer,
  order_no integer,
  baseline_text text,
  target_text text,
  good_direction text,
  config_json text,
  updated_at text
);
ALTER TABLE kpi_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw kpi_registry" ON kpi_registry FOR ALL USING (true) WITH CHECK (true);

-- 10. campaign_reports
CREATE TABLE IF NOT EXISTS campaign_reports (
  id text PRIMARY KEY,
  title text NOT NULL,
  summary text,
  date_from text NOT NULL,
  date_to text NOT NULL,
  aggregate_json text,
  top_posts_json text,
  created_at text NOT NULL
);
ALTER TABLE campaign_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw campaign_reports" ON campaign_reports FOR ALL USING (true) WITH CHECK (true);
