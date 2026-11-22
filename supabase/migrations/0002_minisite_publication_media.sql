BEGIN;

ALTER TABLE public.minisites
  ADD COLUMN IF NOT EXISTS published_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS public.minisite_slug_aliases (
  id SERIAL PRIMARY KEY,
  minisite_id INTEGER NOT NULL REFERENCES public.minisites(id) ON DELETE CASCADE,
  alias_slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_minisite_slug_aliases_minisite_id
  ON public.minisite_slug_aliases(minisite_id);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE public.minisite_slug_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

COMMIT;
