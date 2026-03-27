-- 若早期未执行 018，或远程库缺少 user_settings，本迁移可安全重复执行。

CREATE TABLE IF NOT EXISTS public.user_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on user_settings" ON public.user_settings;
CREATE POLICY "Allow anon all on user_settings"
  ON public.user_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
