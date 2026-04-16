-- Webhook-driven refresh:
-- Add apify_run_id to apt_refresh_runs so the webhook handler can find the
-- corresponding row to update when Apify pings us back.

alter table public.apt_refresh_runs
  add column if not exists apify_run_id text;

create index if not exists idx_apt_refresh_runs_apify_run_id
  on public.apt_refresh_runs(apify_run_id);

comment on column public.apt_refresh_runs.apify_run_id is
  'Apify actor run id; correlates the webhook callback with this row.';
