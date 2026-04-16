# Apartments Module

NYC + NJ rental monitor for Team Wade — curated watchlist of ~40 buildings
Chinese international students actually rent in, refreshed daily from
StreetEasy via Apify.

## Architecture

```
Apify actor (memo23/streeteasy-ppr)
    │
    ▼  once a day at 13:00 UTC (9am ET)
/api/apartments/cron/refresh     ← called by Vercel Cron
    │
    ▼
Supabase Postgres
  ├─ apt_buildings           — curated catalog (admin-toggleable watchlist)
  ├─ apt_listings            — current available units
  ├─ apt_building_notes      — team soft-intel, per building
  ├─ apt_listing_notes       — team soft-intel, per unit
  └─ apt_refresh_runs        — cron audit log
    │
    ▼
/apartments   (Next.js, server components)
  ├─ /apartments              dashboard — unit-level filter table
  ├─ /apartments/buildings    card grid of tracked buildings
  ├─ /apartments/buildings/:slug   building research page
  ├─ /apartments/units/:id    single-unit detail
  └─ /apartments/admin        [admin only] watchlist management
```

## First-time setup

### 1. Apply the DB migration

```bash
npm run apartments:sql    # wraps: node scripts/apply-sql-migration.mjs supabase/migrations/053_apartments.sql
```

### 2. Environment variables

Put these in **`.env.local`** (dev) and in **Vercel Project → Environment Variables** (prod):

```
APIFY_API_TOKEN=apify_api_xxx           # from https://console.apify.com/account/integrations
CRON_SECRET=<random-32-char-string>     # Vercel sends this in Authorization: Bearer header
ADMIN_EMAILS=you@example.com            # only these users can toggle watchlist
```

### 3. Seed data (today, once)

Import the ~400 listings we already have in the local TheMoniter SQLite:

```bash
npm run apartments:migrate
```

(Adjust the SQLite path inside `scripts/migrate-apartments-data.mjs` if your
copy lives elsewhere.)

### 4. Verify locally

```bash
npm run dev
# visit http://localhost:3000/apartments
```

### 5. Tomorrow: automatic refresh

`vercel.json` schedules `/api/apartments/cron/refresh` daily. On each run it:

1. Seeds `apt_buildings` from the static list in `src/lib/apartments/hot_buildings.ts`
2. Calls Apify for each tracked building URL
3. Upserts buildings + listings
4. Marks any listing unseen in 48h as inactive
5. Writes a row to `apt_refresh_runs`

Cost: ~**$0.14/day** (40 buildings × $0.0035 per PPR result).

## Manual refresh (admin)

From `/apartments/admin` click **"Run refresh now"**. You'll be prompted for
the `CRON_SECRET` so service-role writes are gated.

## Adding a new building

Edit `src/lib/apartments/hot_buildings.ts` and push. Next cron run will
pick it up. To get the correct `buildingSlug`, see the helper recipe in
[`../../lib/apartments/hot_buildings.ts`](../../lib/apartments/hot_buildings.ts) —
in short, try `/building/{simple-name}` first on StreetEasy, then
`/building/{name}-{address-with-dashes}` if that 404s.

## File map

| Path | Role |
|---|---|
| `/src/app/apartments/page.tsx`                          | Dashboard — unit filter + table |
| `/src/app/apartments/buildings/page.tsx`                | Card grid of tracked buildings |
| `/src/app/apartments/buildings/[slug]/page.tsx`         | Building research page |
| `/src/app/apartments/units/[id]/page.tsx`               | Unit detail |
| `/src/app/apartments/admin/page.tsx`                    | Admin watchlist mgmt |
| `/src/app/api/apartments/buildings/route.ts`            | GET buildings |
| `/src/app/api/apartments/buildings/[slug]/route.ts`     | GET one building + its units + notes |
| `/src/app/api/apartments/units/route.ts`                | GET filtered unit list |
| `/src/app/api/apartments/units/[id]/route.ts`           | GET one unit |
| `/src/app/api/apartments/notes/route.ts`                | POST/DELETE team note |
| `/src/app/api/apartments/cron/refresh/route.ts`         | Vercel cron entry |
| `/src/app/api/apartments/admin/watchlist/route.ts`      | Admin toggle is_tracked / edit note |
| `/src/lib/apartments/types.ts`                          | Shared types |
| `/src/lib/apartments/hot_buildings.ts`                  | Curated 40-building seed list |
| `/src/lib/apartments/apify.ts`                          | Apify REST client |
| `/src/lib/apartments/parser.ts`                         | Actor JSON → flat rows |
| `/src/lib/apartments/service.ts`                        | Upsert + refresh orchestration |
| `/src/lib/apartments/auth.ts`                           | getSessionUser + requireAdmin |
| `/src/components/apartments/*`                          | UI components |
| `supabase/migrations/053_apartments.sql`                | Schema |
| `vercel.json`                                           | Daily cron |
