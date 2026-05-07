import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "[email-campaigns] 缺少 Supabase 配置。需要 NEXT_PUBLIC_SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY 或 NEXT_PUBLIC_SUPABASE_ANON_KEY)。"
  );
  console.error("[email-campaigns] 用法: node --env-file=.env.local <script>");
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 把命令行 --foo bar --baz qux 解析成 {foo:'bar', baz:'qux'};单独的 --flag 解析成 true */
export function parseArgs(argv) {
  const args = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return args;
}

export function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

export function fail(msg, code = 1) {
  process.stderr.write(`[email-campaigns] ${msg}\n`);
  process.exit(code);
}
