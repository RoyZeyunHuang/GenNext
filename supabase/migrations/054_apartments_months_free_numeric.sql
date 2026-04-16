-- StreetEasy concessions sometimes come back as 0.5 months (2 weeks free).
-- Widen the column so migration + Apify upserts don't 22P02 on 0.5.
alter table public.apt_listings
  alter column months_free type numeric(4,1) using months_free::numeric;
