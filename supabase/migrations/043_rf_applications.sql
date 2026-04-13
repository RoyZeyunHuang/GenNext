-- Application tracking for non-nystudents.net users
-- Stores the application details; approval is via app_metadata.rf_approved on auth.users

CREATE TABLE public.rf_applications (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  display_name text       NOT NULL,
  group_name  text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_rf_applications_status  ON public.rf_applications(status);
CREATE INDEX idx_rf_applications_user    ON public.rf_applications(user_id);
CREATE INDEX idx_rf_applications_created ON public.rf_applications(created_at DESC);

ALTER TABLE public.rf_applications ENABLE ROW LEVEL SECURITY;

-- Users can read their own application
CREATE POLICY rf_applications_select_own
  ON public.rf_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- service_role for admin operations
GRANT SELECT ON public.rf_applications TO authenticated;
GRANT ALL ON public.rf_applications TO service_role;
