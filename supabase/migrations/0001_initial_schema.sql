-- Foco Leads 360 — Feed em Foco 360
-- Migration 0001: Base funcional, empresas, minisites, blocos, auditoria e RLS (Supabase-compatible)

CREATE TABLE IF NOT EXISTS public.profiles (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'consultor_comercial' CHECK (
    role IN ('administrador', 'gestor_comercial', 'consultor_comercial', 'operacional')
  ),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.businesses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT DEFAULT '',
  neighborhood TEXT DEFAULT '',
  state TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  website TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  google_place_id TEXT,
  google_maps_url TEXT,
  source_metadata JSONB DEFAULT '{}'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_is_demo ON public.businesses(is_demo);
CREATE INDEX IF NOT EXISTS idx_businesses_google_place_id ON public.businesses(google_place_id);

CREATE TABLE IF NOT EXISTS public.minisites (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (
    status IN ('rascunho', 'demonstracao', 'publicado', 'desativado')
  ),
  template_id TEXT NOT NULL DEFAULT 'modelo_generico',
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo JSONB NOT NULL DEFAULT '{}'::jsonb,
  views_count INTEGER NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES public.profiles(id) ON DELETE SET NULL,
  publication_authorized_at TIMESTAMPTZ,
  publication_authorized_by INTEGER REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minisites_slug ON public.minisites(slug);
CREATE INDEX IF NOT EXISTS idx_minisites_status ON public.minisites(status);
CREATE INDEX IF NOT EXISTS idx_minisites_is_demo ON public.minisites(is_demo);

CREATE TABLE IF NOT EXISTS public.minisite_blocks (
  id SERIAL PRIMARY KEY,
  minisite_id INTEGER NOT NULL REFERENCES public.minisites(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minisite_blocks_minisite_id ON public.minisite_blocks(minisite_id);

CREATE TABLE IF NOT EXISTS public.minisite_versions (
  id SERIAL PRIMARY KEY,
  minisite_id INTEGER NOT NULL REFERENCES public.minisites(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,
  created_by INTEGER REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.minisite_events (
  id SERIAL PRIMARY KEY,
  minisite_id INTEGER NOT NULL REFERENCES public.minisites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id SERIAL PRIMARY KEY,
  minisite_id INTEGER REFERENCES public.minisites(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by INTEGER REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exemplo de políticas RLS para implantação externa no Supabase:
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minisite_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
