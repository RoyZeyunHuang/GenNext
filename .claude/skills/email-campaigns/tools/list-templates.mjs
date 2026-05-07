#!/usr/bin/env node
/**
 * 列出 email_templates。
 *
 *   node --env-file=.env.local .claude/skills/email-campaigns/tools/list-templates.mjs
 */
import { supabase, out, fail } from "../lib/db.mjs";

const { data, error } = await supabase
  .from("email_templates")
  .select("id, name, subject, body, created_at")
  .order("name", { ascending: true });

if (error) fail(error.message);

const PLACEHOLDER_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

const rows = (data ?? []).map((t) => {
  const found = new Set();
  for (const m of (t.subject + "\n" + t.body).matchAll(PLACEHOLDER_RE)) {
    found.add(m[1]);
  }
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body_preview: String(t.body ?? "").slice(0, 200),
    placeholders: Array.from(found).sort(),
    created_at: t.created_at,
  };
});

out({ count: rows.length, templates: rows });
