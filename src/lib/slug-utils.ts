export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 64;

export const DEFAULT_PUBLIC_BASE_URL = 'https://linkfoco.vercel.app';
export const PUBLIC_MINISITE_ROUTE_PREFIX = '';

export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'painel',
  'dashboard',
  'login',
  'logout',
  'auth',
  'signin',
  'signup',
  'register',
  'oauth',
  'callback',
  'assets',
  'uploads',
  'public',
  'static',
  'health',
  'q',
  'm',
  'demo',
  'site',
  's',
  'minisites',
  'minisite',
  'criar-minisite',
  'prospeccao',
  'crm',
  'qr-codes',
  'qrcodes',
  'scripts',
  'configuracoes',
  'config',
  'empresas',
  'equipe',
  'logs',
  'diagnosticos',
  'propostas',
  'whatsapp',
  'fluxos',
  'agenda',
  'projetos',
  'clientes',
  'cobrancas',
  'relatorios',
  'integracoes',
  'ajuda',
  'favicon',
  'favicon.ico',
  'robots',
  'robots.txt',
  'sitemap',
  'sitemap.xml',
  'manifest',
  'manifest.json',
  'sw',
  'sw.js',
  'linkfoco',
  'well-known',
]);

const INTERNAL_FIRST_SEGMENTS = new Set([
  'api',
  'assets',
  'uploads',
  'public',
  'static',
  'health',
  'q',
  'demo',
  'm',
  's',
  'site',
  'minisites',
  'minisite',
  'criar-minisite',
  'prospeccao',
  'crm',
  'qr-codes',
  'qrcodes',
  'scripts',
  'configuracoes',
  'config',
  'empresas',
  'equipe',
  'logs',
  'diagnosticos',
  'propostas',
  'whatsapp',
  'fluxos',
  'agenda',
  'projetos',
  'clientes',
  'cobrancas',
  'relatorios',
  'integracoes',
  'admin',
  'painel',
  'dashboard',
  'login',
  'logout',
  'auth',
  'signin',
  'signup',
  'register',
  'oauth',
  'callback',
  'linkfoco',
  'ajuda',
]);

function normalizeHttpOrigin(raw?: string | null): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === 'MY_APP_URL') return '';
  if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return '';
  }
}

function readEnvPublicBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env) {
    const serverVal = normalizeHttpOrigin(
      process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL
    );
    if (serverVal) return serverVal;
  }
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    const clientVal = normalizeHttpOrigin(viteEnv?.VITE_PUBLIC_BASE_URL);
    if (clientVal) return clientVal;
  } catch {
    // non-Vite runtime
  }
  return '';
}

/**
 * Resolves the configured canonical public origin for shared minisite URLs.
 * Defaults to https://linkfoco.vercel.app when no explicit environment origin is set.
 */
export function getConfiguredPublicBaseUrl(override?: string | null): string {
  return normalizeHttpOrigin(override) || readEnvPublicBaseUrl() || DEFAULT_PUBLIC_BASE_URL;
}

/**
 * Normalizes a company name or user-provided slug into a safe URL path segment.
 * Removes diacritics, lowercases, replaces invalid characters with single hyphens,
 * and trims edges within MAX_SLUG_LENGTH.
 */
export function normalizeSlug(raw: string): string {
  const cleaned = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return cleaned;
}

export function isReservedSlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase();
  return RESERVED_SLUGS.has(normalized);
}

export interface SlugValidationResult {
  valid: boolean;
  normalized: string;
  reason?: string;
}

export function validateSlug(raw: string): SlugValidationResult {
  const trimmed = String(raw || '').trim().toLowerCase();
  const normalized = normalizeSlug(trimmed);

  if (!trimmed) {
    return { valid: false, normalized, reason: 'Informe um endereço (slug) para o minisite.' };
  }

  if (trimmed !== normalized) {
    return {
      valid: false,
      normalized,
      reason:
        'Use apenas letras minúsculas sem acento, números e hífen simples (ex: nosso-pet-favorito).',
    };
  }

  if (normalized.length < MIN_SLUG_LENGTH) {
    return {
      valid: false,
      normalized,
      reason: `O endereço deve ter pelo menos ${MIN_SLUG_LENGTH} caracteres.`,
    };
  }

  if (normalized.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      normalized,
      reason: `O endereço deve ter no máximo ${MAX_SLUG_LENGTH} caracteres.`,
    };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      reason: 'Formato de slug inválido. Evite hífens duplos ou nas extremidades.',
    };
  }

  if (isReservedSlug(normalized)) {
    return {
      valid: false,
      normalized,
      reason: `O endereço "/${normalized}" é reservado pelo sistema. Escolha outro identificador.`,
    };
  }

  return { valid: true, normalized };
}

/**
 * Generates an ordered list of valid, non-reserved base candidate slugs from a business title.
 * Used when auto-creating a slug so reserved names (e.g. "Admin") automatically become "admin-2" or "empresa-admin".
 */
export function buildSlugBaseFromTitle(title: string, isDemo = false): string {
  let base = normalizeSlug(title);
  if (!base || base.length < MIN_SLUG_LENGTH) {
    base = base ? `${base}-site` : 'empresa-foco';
  }
  if (isDemo && !base.endsWith('-demo')) {
    const suffix = '-demo';
    const head = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, '');
    base = `${head || 'empresa'}${suffix}`;
  }
  return base;
}

export function formatSlugWithSuffix(base: string, suffixIndex: number): string {
  if (suffixIndex <= 1) return base;
  const suffix = `-${suffixIndex}`;
  const head = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, '');
  return `${head || 'empresa'}${suffix}`;
}

/**
 * Builds the canonical path for any public minisite: /{slug}
 */
export function buildPublicMinisitePath(slug: string): string {
  const cleanSlug = encodeURIComponent(String(slug || '').trim().replace(/^\/+/, ''));
  if (!cleanSlug) return '/';
  return `/${cleanSlug}`;
}

/**
 * Builds local relative preview path so dev dashboard preview/open links always work
 * on the active local origin without requiring external Vercel deployment.
 */
export function buildLocalMinisitePreviewPath(slug: string, status?: string): string {
  const cleanSlug = encodeURIComponent(String(slug || '').trim().replace(/^\/+/, ''));
  if (!cleanSlug) return '/';
  return status === 'publicado' ? buildPublicMinisitePath(cleanSlug) : `/demo/${cleanSlug}`;
}

/**
 * Builds the unified canonical public URL for minisites:
 *   <configuredPublicOrigin>/<slug>
 * Defaults to https://linkfoco.vercel.app/<slug> when no override/origin is supplied.
 */
export function buildPublicMinisiteUrl(
  slug: string,
  options?: { origin?: string | null; publicBaseUrl?: string | null }
): string {
  const pathSegment = buildPublicMinisitePath(slug);
  const validEnvBase = normalizeHttpOrigin(options?.publicBaseUrl);
  const validExplicitOrigin = normalizeHttpOrigin(options?.origin);
  const base = validEnvBase || validExplicitOrigin || getConfiguredPublicBaseUrl();
  return `${base}${pathSegment}`;
}

export function buildChannelPublicMinisiteUrl(
  slug: string,
  channel: string,
  options?: { origin?: string | null; publicBaseUrl?: string | null }
): string {
  const baseUrl = buildPublicMinisiteUrl(slug, options);
  const cleanChannel = String(channel || '').trim();
  if (!cleanChannel) return baseUrl;
  return `${baseUrl}?src=${encodeURIComponent(cleanChannel)}`;
}

function validateExtractedCandidateSlug(candidate: string): string | null {
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    decoded = candidate;
  }

  const lower = decoded.trim().toLowerCase();
  if (!lower || INTERNAL_FIRST_SEGMENTS.has(lower) || RESERVED_SLUGS.has(lower)) {
    return null;
  }

  // Hidden files (.env, .well-known) or static files with extensions (.js, .css, .png, .ico, .txt, .xml, .json)
  if (lower.startsWith('.') || /\.[a-z0-9]{1,8}$/i.test(lower)) {
    return null;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lower) || lower.length < MIN_SLUG_LENGTH || lower.length > MAX_SLUG_LENGTH) {
    return null;
  }

  return lower;
}

/**
 * Extracts a slug from legacy prefixed public routes: /LinkFoco/:slug or /s/:slug (case-insensitive).
 * Used to redirect legacy published links cleanly to canonical /:slug preserving query parameters.
 */
export function extractLegacyPrefixedSlugFromPath(pathname: string): string | null {
  const cleanPath = (pathname || '/').split('?')[0].split('#')[0];
  if (!cleanPath || cleanPath === '/' || cleanPath.startsWith('/@') || cleanPath.startsWith('/.')) {
    return null;
  }
  const segments = cleanPath.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length !== 2) return null;
  const prefix = segments[0].toLowerCase();
  if (prefix !== 'linkfoco' && prefix !== 's') {
    return null;
  }
  return validateExtractedCandidateSlug(segments[1]);
}

/**
 * Extracts the public minisite slug from canonical /:slug or legacy /LinkFoco/:slug and /s/:slug.
 * Returns null if the path belongs to the internal platform, API, assets, root files, or a reserved route.
 */
export function extractPublicMinisiteSlugFromPath(pathname: string): string | null {
  const cleanPath = (pathname || '/').split('?')[0].split('#')[0];
  if (cleanPath === '/' || cleanPath === '') return null;
  if (
    cleanPath.startsWith('/@') ||
    cleanPath.startsWith('/.') ||
    cleanPath.startsWith('/src/') ||
    cleanPath.startsWith('/node_modules/')
  ) {
    return null;
  }

  const segments = cleanPath.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length === 1) {
    return validateExtractedCandidateSlug(segments[0]);
  }
  if (segments.length === 2) {
    return extractLegacyPrefixedSlugFromPath(cleanPath);
  }
  return null;
}

/**
 * Determines whether a request pathname belongs to the internal platform/API/assets/root-files
 * rather than a public /:slug (or legacy /LinkFoco/:slug, /s/:slug) minisite route.
 */
export function isInternalOrReservedPath(pathname: string): boolean {
  return extractPublicMinisiteSlugFromPath(pathname) === null;
}
