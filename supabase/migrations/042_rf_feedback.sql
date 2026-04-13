-- RF Feedback table: stores user feedback submissions
-- Tracks whether users have submitted feedback (used for forced feedback modal after 10 generations)

CREATE TABLE public.rf_feedback (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    text        NOT NULL CHECK (char_length(content) >= 15),
  rating     int,                                       -- optional 1-5 star
  page       text        DEFAULT 'general',              -- which page submitted from
  metadata   jsonb       DEFAULT '{}',                   -- extra context (generation count, etc.)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rf_feedback_user    ON public.rf_feedback(user_id);
CREATE INDEX idx_rf_feedback_created ON public.rf_feedback(created_at DESC);

ALTER TABLE public.rf_feedback ENABLE ROW LEVEL SECURITY;

-- Users can read their own feedback
CREATE POLICY rf_feedback_select_own
  ON public.rf_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own feedback
CREATE POLICY rf_feedback_insert_own
  ON public.rf_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- service_role can do everything (admin reads all)
GRANT SELECT, INSERT ON public.rf_feedback TO authenticated;
GRANT ALL ON public.rf_feedback TO service_role;
