-- Apartments module: curated NYC/NJ building watchlist + unit inventory +
-- team research notes. Data source: Apify `memo23/streeteasy-ppr` actor.
-- See /src/app/apartments and /src/lib/apartments.

create extension if not exists "pgcrypto";

-- ---------- Buildings: admin-curated catalog ----------
create table if not exists public.apt_buildings (
    id                     text primary key,             -- StreetEasy building_id
    name                   text not null,
    short_name             text,
    address                text,
    neighborhood           text,
    borough                text,
    area                   text not null,                -- lic / queens / manhattan / brooklyn / jersey_city
    tag                    text,                         -- new_2026 / new_2025 / new_2024 / core / legacy
    building_url           text not null,
    building_slug          text,
    official_url           text,
    leasing_phone          text,
    leasing_company        text,
    year_built             integer,
    floor_count            integer,
    unit_count             integer,
    active_rentals_count   integer,
    open_rentals_count     integer,
    closed_rentals_count   integer,
    is_new_development     boolean default false,
    image_url              text,
    amenities              text[] default '{}',
    subways                jsonb,                        -- nearby subway lines + distances
    schools                jsonb,                        -- nearby schools
    description            text,
    note                   text,                         -- curator's one-liner
    is_tracked             boolean default true,         -- on the watchlist
    tracked_at             timestamptz default now(),
    last_fetched_at        timestamptz,
    created_at             timestamptz default now(),
    updated_at             timestamptz default now()
);

create index if not exists idx_apt_buildings_area     on public.apt_buildings(area);
create index if not exists idx_apt_buildings_tracked  on public.apt_buildings(is_tracked) where is_tracked;
create index if not exists idx_apt_buildings_tag      on public.apt_buildings(tag);

-- ---------- Listings: unit-level inventory ----------
create table if not exists public.apt_listings (
    id                     text primary key,             -- StreetEasy listing_id
    building_id            text references public.apt_buildings(id) on delete cascade,
    url                    text not null,
    unit                   text,
    address                text,
    neighborhood           text,
    borough                text,
    price_monthly          integer,
    bedrooms               real,
    bathrooms              real,
    sqft                   numeric(8,1),      -- defensive: StreetEasy occasionally returns decimals
    no_fee                 boolean default false,
    is_featured            boolean default false,
    furnished              boolean default false,
    available_at           date,
    months_free            numeric(4,1),      -- StreetEasy offers half-month concessions (0.5)
    lease_term_months      numeric(5,1),      -- StreetEasy uses 12.5 = 12 months + 2 weeks free
    image_url              text,
    floor_plan_url         text,
    listing_type           text,
    first_seen_at          timestamptz default now(),
    last_seen_at           timestamptz default now(),
    is_active              boolean default true,
    source                 text default 'apify'
);

create index if not exists idx_apt_listings_building   on public.apt_listings(building_id);
create index if not exists idx_apt_listings_active     on public.apt_listings(is_active, first_seen_at desc);
create index if not exists idx_apt_listings_price      on public.apt_listings(price_monthly) where is_active;
create index if not exists idx_apt_listings_beds       on public.apt_listings(bedrooms) where is_active;
create index if not exists idx_apt_listings_available  on public.apt_listings(available_at) where is_active;

-- ---------- Building-level team notes ----------
create table if not exists public.apt_building_notes (
    id            uuid primary key default gen_random_uuid(),
    building_id   text not null references public.apt_buildings(id) on delete cascade,
    author_id     uuid references auth.users(id) on delete set null,
    author_email  text,
    body          text not null check (length(body) > 0 and length(body) < 4000),
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

create index if not exists idx_apt_building_notes_b on public.apt_building_notes(building_id, created_at desc);

-- ---------- Unit-level team notes ----------
create table if not exists public.apt_listing_notes (
    id            uuid primary key default gen_random_uuid(),
    listing_id    text not null references public.apt_listings(id) on delete cascade,
    author_id     uuid references auth.users(id) on delete set null,
    author_email  text,
    body          text not null check (length(body) > 0 and length(body) < 4000),
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

create index if not exists idx_apt_listing_notes_l on public.apt_listing_notes(listing_id, created_at desc);

-- ---------- Refresh runs audit log ----------
create table if not exists public.apt_refresh_runs (
    id                     uuid primary key default gen_random_uuid(),
    started_at             timestamptz default now(),
    finished_at            timestamptz,
    status                 text,                          -- running / ok / blocked / error
    buildings_requested    integer default 0,
    buildings_fetched      integer default 0,
    listings_upserted      integer default 0,
    listings_new           integer default 0,
    listings_inactivated   integer default 0,
    cost_cents_estimate    integer,                       -- PPR: cents = results × 0.35
    error_message          text,
    triggered_by           text                           -- cron / manual / migration
);

create index if not exists idx_apt_refresh_runs_started on public.apt_refresh_runs(started_at desc);

-- ---------- RLS ----------
alter table public.apt_buildings      enable row level security;
alter table public.apt_listings       enable row level security;
alter table public.apt_building_notes enable row level security;
alter table public.apt_listing_notes  enable row level security;
alter table public.apt_refresh_runs   enable row level security;

-- Read-only for any authenticated user; writes via service role only (cron + migration)
do $$
begin
  -- buildings
  if not exists (select 1 from pg_policies where tablename='apt_buildings' and policyname='apt_buildings_read') then
    create policy apt_buildings_read on public.apt_buildings      for select using (auth.role() = 'authenticated');
  end if;
  -- listings
  if not exists (select 1 from pg_policies where tablename='apt_listings' and policyname='apt_listings_read') then
    create policy apt_listings_read on public.apt_listings       for select using (auth.role() = 'authenticated');
  end if;
  -- refresh runs
  if not exists (select 1 from pg_policies where tablename='apt_refresh_runs' and policyname='apt_refresh_runs_read') then
    create policy apt_refresh_runs_read on public.apt_refresh_runs for select using (auth.role() = 'authenticated');
  end if;

  -- building notes: all authed read; write own
  if not exists (select 1 from pg_policies where tablename='apt_building_notes' and policyname='apt_bn_read') then
    create policy apt_bn_read   on public.apt_building_notes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='apt_building_notes' and policyname='apt_bn_insert') then
    create policy apt_bn_insert on public.apt_building_notes for insert with check (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='apt_building_notes' and policyname='apt_bn_update') then
    create policy apt_bn_update on public.apt_building_notes for update using (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='apt_building_notes' and policyname='apt_bn_delete') then
    create policy apt_bn_delete on public.apt_building_notes for delete using (auth.uid() = author_id);
  end if;

  -- listing notes: same pattern
  if not exists (select 1 from pg_policies where tablename='apt_listing_notes' and policyname='apt_ln_read') then
    create policy apt_ln_read   on public.apt_listing_notes for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='apt_listing_notes' and policyname='apt_ln_insert') then
    create policy apt_ln_insert on public.apt_listing_notes for insert with check (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='apt_listing_notes' and policyname='apt_ln_update') then
    create policy apt_ln_update on public.apt_listing_notes for update using (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='apt_listing_notes' and policyname='apt_ln_delete') then
    create policy apt_ln_delete on public.apt_listing_notes for delete using (auth.uid() = author_id);
  end if;
end $$;

comment on table public.apt_buildings      is 'Curated NYC/NJ buildings with Chinese-student density';
comment on table public.apt_listings       is 'Active rental units per building (refreshed daily via Apify)';
comment on table public.apt_building_notes is 'Team soft-intel notes on a building (shared read, own-write)';
comment on table public.apt_listing_notes  is 'Team notes on a specific unit';
comment on table public.apt_refresh_runs   is 'Audit log of Apify scrape runs (cron + manual)';
