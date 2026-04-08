#!/usr/bin/env node
/**
 * Apply a SQL file to Supabase Postgres using the Supabase CLI.
 *
 *   SUPABASE_DB_URL='postgresql://postgres.[ref]:[password]@aws-0-...pooler.supabase.com:6543/postgres' \
 *     node scripts/apply-sql-migration.mjs supabase/migrations/032_docs_owner_id.sql
 *
 * Get the URI from: Supabase Dashboard → Project Settings → Database → Connection string → URI.
 * If the password contains @ or other special characters, URL-encode it in the connection string.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.SUPABASE_DB_URL;
const fileArg = process.argv[2];
if (!url?.trim()) {
  console.error("Missing SUPABASE_DB_URL. See comments in scripts/apply-sql-migration.mjs");
  process.exit(1);
}
if (!fileArg) {
  console.error("Usage: SUPABASE_DB_URL=... node scripts/apply-sql-migration.mjs <path-to.sql>");
  process.exit(1);
}
const file = resolve(process.cwd(), fileArg);
if (!existsSync(file)) {
  console.error("File not found:", file);
  process.exit(1);
}

const r = spawnSync(
  "npx",
  ["supabase", "db", "query", "--db-url", url, "-f", file, "--agent=no"],
  { stdio: "inherit", shell: true, env: process.env }
);
process.exit(r.status ?? 1);
