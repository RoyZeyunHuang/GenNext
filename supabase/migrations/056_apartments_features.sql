-- Sprint v2: AI pitch cache + per-day building snapshots for trends.
-- Both tables are independent of existing apt_* and safely re-runnable.

create extension if not exists "pgcrypto";

-- ---------- AI school-pitch cache ----------
-- Stores generated agent pitch text per (building × school × language).
-- Refresh whenever (a) cache > 30 days OR (b) prompt_hash changes
-- (e.g. we updated the prompt template / building data changed).
create table if not exists public.apt_pitch_cache (
    id              uuid primary key default gen_random_uuid(),
    building_id     text not null references public.apt_buildings(id) on delete cascade,
    school_short    text not null,                       -- e.g. "NYU WSQ", "Columbia", "Pratt"
    language        text not null default 'zh',          -- 'zh' | 'en'
    body            text not null,                       -- the generated pitch
    model           text,                                -- e.g. 'claude-sonnet-4-20250514'
    prompt_hash     text,                                -- sha1 of (template + building snapshot data)
    tokens_in       integer,
    tokens_out      integer,
    created_at      timestamptz default now(),
    constraint apt_pitch_cache_uniq unique (building_id, school_short, language)
);
create index if not exists idx_apt_pitch_cache_building on public.apt_pitch_cache(building_id);
create index if not exists idx_apt_pitch_cache_created  on public.apt_pitch_cache(created_at desc);

-- ---------- Per-day building snapshots (for 30-day trend) ----------
-- Cron writes one row per (building × calendar date). Re-running same day
-- updates the row in place. Cheap to query (id+date PK).
create table if not exists public.apt_building_snapshots (
    building_id           text not null references public.apt_buildings(id) on delete cascade,
    snapshot_date         date not null,
    active_count          integer,
    open_rentals_count    integer,
    median_price_by_beds  jsonb,           -- { "0": 4035, "1": 5100, "2": 7305 }
    avg_months_free       numeric(4,2),
    snapshot_at           timestamptz default now(),
    primary key (building_id, snapshot_date)
);
create index if not exists idx_apt_building_snapshots_date on public.apt_building_snapshots(snapshot_date desc);
create index if not exists idx_apt_building_snapshots_building_date
    on public.apt_building_snapshots(building_id, snapshot_date desc);

-- ---------- RLS ----------
alter table public.apt_pitch_cache         enable row level security;
alter table public.apt_building_snapshots  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='apt_pitch_cache' and policyname='apt_pitch_cache_read') then
    create policy apt_pitch_cache_read on public.apt_pitch_cache for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='apt_building_snapshots' and policyname='apt_building_snapshots_read') then
    create policy apt_building_snapshots_read on public.apt_building_snapshots for select using (auth.role() = 'authenticated');
  end if;
end $$;

comment on table public.apt_pitch_cache         is 'Cached AI-generated school pitches per building (Phase 5).';
comment on table public.apt_building_snapshots  is 'Daily per-building aggregates for trend charts (Phase 6).';
