-- Content factory: per-user private categories/docs vs shared public (owner_id NULL).
-- RLS remains anon-all for GenNext compatibility; API layer enforces scoping when session exists.

ALTER TABLE public.doc_categories
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.docs
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_doc_categories_owner ON public.doc_categories(owner_id);
CREATE INDEX IF NOT EXISTS idx_docs_owner ON public.docs(owner_id);

COMMENT ON COLUMN public.doc_categories.owner_id IS 'NULL = public category; set = private to that user';
COMMENT ON COLUMN public.docs.owner_id IS 'NULL = public doc; set = private to that user';
