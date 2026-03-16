-- 删除旧的 KPI 相关表（保留其他模块的表不动）
DROP VIEW IF EXISTS organic_metrics_daily;
DROP TABLE IF EXISTS kpi_entries CASCADE;
DROP TABLE IF EXISTS campaign_reports CASCADE;
DROP TABLE IF EXISTS kpi_registry_history CASCADE;
DROP TABLE IF EXISTS kpi_registry CASCADE;
DROP TABLE IF EXISTS ig_posts_raw CASCADE;
DROP TABLE IF EXISTS ig_post_metrics_snapshots CASCADE;
DROP TABLE IF EXISTS core_ig_posts CASCADE;
DROP TABLE IF EXISTS post_attributes CASCADE;
DROP TABLE IF EXISTS dict_posts CASCADE;
DROP TABLE IF EXISTS core_posts CASCADE;
DROP TABLE IF EXISTS daily_top30_snapshot CASCADE;
DROP TABLE IF EXISTS xhs_newrank_raw CASCADE;
DROP TABLE IF EXISTS xhs_daily_push_raw CASCADE;
DROP TABLE IF EXISTS xhs_spotlight_raw CASCADE;
DROP TABLE IF EXISTS xhs_perf_raw CASCADE;
DROP TABLE IF EXISTS xhs_post_metrics_snapshots CASCADE;
DROP TABLE IF EXISTS paid_metrics_daily CASCADE;

-- 表1：笔记全量快照（来自"笔记列表明细表"）
CREATE TABLE xhs_notes (
  id uuid default gen_random_uuid() primary key,
  snapshot_date date not null,
  title text not null,
  publish_time text,
  genre text,
  exposure bigint default 0,
  views bigint default 0,
  cover_ctr real,
  likes int default 0,
  comments int default 0,
  collects int default 0,
  follows int default 0,
  shares int default 0,
  avg_watch_time real,
  danmaku int default 0,
  content_type text,
  is_paid boolean default false,
  note_id text,
  created_at timestamptz default now()
);

CREATE UNIQUE INDEX idx_xhs_notes_title_snapshot ON xhs_notes(title, snapshot_date);
CREATE INDEX idx_xhs_notes_snapshot ON xhs_notes(snapshot_date);
CREATE INDEX idx_xhs_notes_title ON xhs_notes(title);
CREATE INDEX idx_xhs_notes_type ON xhs_notes(content_type);

-- 表2：投放日报（来自"笔记投放数据"）
CREATE TABLE xhs_paid_daily (
  id uuid default gen_random_uuid() primary key,
  event_date date not null,
  note_id text,
  note_link text,
  spend real default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  ctr real,
  avg_click_cost real,
  avg_cpm real,
  interactions bigint default 0,
  avg_interaction_cost real,
  play_5s bigint default 0,
  completion_5s real,
  dm_in int default 0,
  dm_open int default 0,
  dm_lead int default 0,
  dm_in_cost real,
  dm_lead_cost real,
  author_id text,
  creator text,
  video_plays bigint default 0,
  dm_lead_persons int default 0,
  dm_open_cost real,
  wechat_adds int default 0,
  wechat_add_rate real,
  note_title text,
  created_at timestamptz default now()
);

CREATE UNIQUE INDEX idx_xhs_paid_note_date ON xhs_paid_daily(note_id, event_date);
CREATE INDEX idx_xhs_paid_date ON xhs_paid_daily(event_date);
CREATE INDEX idx_xhs_paid_note ON xhs_paid_daily(note_id);

ALTER TABLE xhs_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE xhs_paid_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on xhs_notes" ON xhs_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on xhs_paid_daily" ON xhs_paid_daily FOR ALL USING (true) WITH CHECK (true);
