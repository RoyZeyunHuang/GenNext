-- StreetEasy sometimes returns decimal values for fields we originally typed
-- as integer. Widen them to numeric. Safe to run repeatedly.
alter table public.apt_listings
  alter column months_free       type numeric(4,1) using months_free::numeric,
  alter column lease_term_months type numeric(5,1) using lease_term_months::numeric,
  alter column sqft              type numeric(8,1) using sqft::numeric;
