-- Cache Google Maps Distance Matrix results per building, so we don't
-- re-call the API on every page load. Refreshed by daily cron (or lazily
-- on first page view if missing).
alter table public.apt_buildings
  add column if not exists commutes jsonb,
  add column if not exists commutes_fetched_at timestamptz;
