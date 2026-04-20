-- ScrapingBee 抓取的 SE 建筑页能拿到 developer / 经纬度，
-- 加 3 列让 refreshViaScrapingBee 能存下来。
-- （leasing_company 之前已有，保留不动）

alter table public.apt_buildings
  add column if not exists developer text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column public.apt_buildings.developer is
  'Building developer / sponsor name (from StreetEasy page).';
comment on column public.apt_buildings.latitude is
  'WGS84 latitude of the building; populated from StreetEasy geo metadata.';
comment on column public.apt_buildings.longitude is
  'WGS84 longitude of the building; populated from StreetEasy geo metadata.';
