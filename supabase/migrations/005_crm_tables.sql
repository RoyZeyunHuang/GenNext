-- CRM: companies, contacts, properties, property_companies, outreach

CREATE TABLE IF NOT EXISTS companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text,
  phone text,
  email text,
  website text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw companies" ON companies FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  title text,
  phone text,
  email text,
  linkedin_url text,
  is_primary boolean default false,
  created_at timestamptz default now()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS properties (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  address text,
  city text default 'New York',
  area text,
  price_range text,
  units integer,
  build_year integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw properties" ON properties FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS property_companies (
  id uuid default gen_random_uuid() primary key,
  property_id uuid not null references properties(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role text not null,
  unique(property_id, company_id, role)
);
ALTER TABLE property_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw property_companies" ON property_companies FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS outreach (
  id uuid default gen_random_uuid() primary key,
  property_id uuid not null references properties(id) on delete cascade,
  status text default 'Not Started',
  contact_name text,
  contact_info text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
ALTER TABLE outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon rw outreach" ON outreach FOR ALL USING (true) WITH CHECK (true);
