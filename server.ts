import express from 'express';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import {
  createBusinessRecord,
  createMinisiteRecord,
  deleteMinisiteRecord,
  getBusinessById,
  getDashboardData,
  getMediaAssetByFilename,
  listIndexableMinisiteSlugs,
  getMinisiteDetail,
  getOrCreateProfile,
  listAuditLogs,
  listBusinesses,
  listMinisites,
  listMinisiteVersions,
  listProfiles,
  publishMinisiteSnapshot,
  resolvePublicMinisiteLookup,
  restoreMinisiteVersion,
  saveMediaAsset,
  SlugValidationError,
  unpublishMinisite,
  updateBusinessGoogleData,
  updateMinisiteFull,
  updateMinisiteStatus,
  updateProfileRoleAndStatus,
} from './src/db/repositories.ts';
import {
  createCommercialScript,
  createCrmLead,
  createQrCode,
  CRM_STAGES,
  deleteCommercialScript,
  deleteCrmLead,
  deleteQrCode,
  getMonthlyProspectingUsage,
  getOperatorSettings,
  listCommercialScripts,
  listCrmLeads,
  listProspectingSearches,
  listQrCodes,
  resolveAndTrackQrCode,
  restoreDefaultScripts,
  saveProspectingSearch,
  updateCommercialScript,
  updateCrmLead,
  updateQrCode,
  upsertOperatorSettings,
} from './src/db/crm-repositories.ts';
import { MINISITE_STATUSES, USER_ROLES } from './src/db/schema.ts';
import {
  optionalAuthOrDemo,
  requireAuth,
  requirePermission,
  type AuthRequest,
} from './src/middleware/auth.ts';
import {
  ADMIN_SESSION_UID,
  issueAdminSessionToken,
  verifyAdminCredentialsServer,
} from './src/lib/admin-session.ts';
import { safeResolveGoogleMapsLink } from './src/lib/google-link-parser.ts';
import {
  getPlaceDetailsById,
  getPlacePhotoMediaUri,
  GoogleMapsQuotaError,
  GooglePlacesApiError,
  searchPlacesByText,
  searchPlacesProspecting,
  type GooglePlaceCandidate,
} from './src/lib/google-places.ts';
import {
  analyzeBrandPaletteWithGemini,
  formatGeminiError,
  structureMinisiteWithGemini,
  type ImageInputPart,
} from './src/lib/gemini.ts';
import {
  enforceThemePaletteContrast,
  getDefaultPaletteForTemplate,
  type MinisiteTheme,
} from './src/lib/minisite-types.ts';
import {
  buildGoogleGalleryImages,
  buildMinisiteBlocksFromGooglePlace,
  buildPlacePhotoProxyUrl,
  extractCleanBrandTitle,
  formatOpenBadgeText,
  mergeGooglePlaceRefresh,
  resolveImportedLogoImage,
} from './src/lib/minisite-builder.ts';
import {
  buildPublicMinisitePath,
  buildPublicMinisiteUrl,
  DEFAULT_PUBLIC_BASE_URL,
  extractLegacyPrefixedSlugFromPath,
  extractPublicMinisiteSlugFromPath,
  getConfiguredPublicBaseUrl,
} from './src/lib/slug-utils.ts';

dotenv.config();

// Transient short-lived in-memory map for photo resource names and HTTP photo binaries (never persisted in DB per Places ToS)
const PHOTO_CACHE_TTL_MS = 5 * 60 * 1000;
const PHOTO_BINARY_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_TRANSIENT_PHOTO_BINARIES = 80;

const transientPhotoCache = new Map<
  string,
  { photos: Array<{ photoName: string }>; expiresAt: number }
>();

const transientPhotoBinaryCache = new Map<
  string,
  { buf: Buffer; contentType: string; expiresAt: number }
>();

const inFlightPhotoFetches = new Map<
  string,
  Promise<{ buf: Buffer; contentType: string }>
>();

function clearTransientPhotoCacheForPlace(placeId: string) {
  const cleanId = String(placeId || '').trim();
  if (!cleanId) return;
  transientPhotoCache.delete(cleanId);
  const prefix = `place:${cleanId}:`;
  const namePrefix = `name:places/${cleanId}/photos/`;
  for (const key of transientPhotoBinaryCache.keys()) {
    if (key.startsWith(prefix) || key.startsWith(namePrefix)) {
      transientPhotoBinaryCache.delete(key);
    }
  }
}

function setTransientPhotoBinary(key: string, buf: Buffer, contentType: string) {
  if (transientPhotoBinaryCache.has(key)) {
    transientPhotoBinaryCache.delete(key);
  }
  while (transientPhotoBinaryCache.size >= MAX_TRANSIENT_PHOTO_BINARIES) {
    const oldest = transientPhotoBinaryCache.keys().next().value;
    if (!oldest) break;
    transientPhotoBinaryCache.delete(oldest);
  }
  transientPhotoBinaryCache.set(key, {
    buf,
    contentType,
    expiresAt: Date.now() + PHOTO_BINARY_CACHE_TTL_MS,
  });
}

function cachePlacePhotos(placeId: string, photos: Array<{ photoName: string }>) {
  const cleanId = String(placeId || '').trim();
  if (!cleanId || !Array.isArray(photos) || photos.length === 0) return;
  transientPhotoCache.set(cleanId, {
    photos: photos.map((p) => ({ photoName: p.photoName })).filter((p) => Boolean(p.photoName)),
    expiresAt: Date.now() + PHOTO_CACHE_TTL_MS,
  });
}

async function resolveFreshPhotoName(placeId: string, idx: number, forceRefresh = false): Promise<string | null> {
  const cleanId = String(placeId || '').trim();
  if (!cleanId) return null;
  const safeIdx = Math.max(0, Math.floor(idx || 0));

  if (!forceRefresh) {
    const cached = transientPhotoCache.get(cleanId);
    if (cached && cached.expiresAt > Date.now() && cached.photos[safeIdx]?.photoName) {
      return cached.photos[safeIdx].photoName;
    }
  }

  const place = await getPlaceDetailsById(cleanId, { photosOnly: true });
  cachePlacePhotos(cleanId, place.photos);
  return place.photos[safeIdx]?.photoName || null;
}

async function downloadRemotePlacePhoto(photoUri: string): Promise<{ buf: Buffer; contentType: string }> {
  const imgResp = await fetch(photoUri, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'image/*,*/*;q=0.8' },
  });
  if (!imgResp.ok) {
    throw new GooglePlacesApiError(
      `Falha ao baixar imagem do Google (${imgResp.status}).`,
      imgResp.status,
      'GMP_PHOTO_FETCH_ERROR'
    );
  }
  const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new GooglePlacesApiError('Resposta de imagem inválida do Google.', 502, 'GMP_PHOTO_INVALID_TYPE');
  }
  const arrayBuffer = await imgResp.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (buf.length === 0) {
    throw new GooglePlacesApiError('Imagem retornada vazia.', 404, 'GMP_PHOTO_EMPTY');
  }
  return { buf, contentType };
}

async function loadGooglePlacePhotoBinary(params: {
  placeId?: string;
  photoName?: string;
  idx?: number;
}): Promise<{ buf: Buffer; contentType: string }> {
  const queryPlaceId = String(params.placeId || '').trim();
  const safeIdx = Math.max(0, Math.floor(Number(params.idx || 0)));
  const initialPhotoName = String(params.photoName || '').trim();
  const extractedPlaceId = initialPhotoName.match(/^places\/([^/]+)\/photos\//)?.[1] || '';
  const effectivePlaceId = queryPlaceId || extractedPlaceId;

  const canonicalWidth = 960;
  const cacheKey =
    effectivePlaceId && !initialPhotoName
      ? `place:${effectivePlaceId}:${safeIdx}`
      : initialPhotoName
        ? `name:${initialPhotoName}`
        : '';

  if (!cacheKey) {
    throw new GooglePlacesApiError('Referência de foto inválida.', 400, 'GMP_INVALID_PHOTO_REF');
  }

  const cached = transientPhotoBinaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { buf: cached.buf, contentType: cached.contentType };
  }
  if (cached) {
    transientPhotoBinaryCache.delete(cacheKey);
  }

  const existingInFlight = inFlightPhotoFetches.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchTask = (async () => {
    let photoName = initialPhotoName;
    if (queryPlaceId && !photoName) {
      const resolved = await resolveFreshPhotoName(queryPlaceId, safeIdx, false);
      if (!resolved) {
        throw new GooglePlacesApiError(
          'Foto não encontrada para este índice do Google Place.',
          404,
          'GMP_PHOTO_NOT_FOUND'
        );
      }
      photoName = resolved;
    }

    if (!photoName || !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
      throw new GooglePlacesApiError('Referência de foto inválida.', 400, 'GMP_INVALID_PHOTO_REF');
    }

    let result: { buf: Buffer; contentType: string };
    try {
      const photoUri = await getPlacePhotoMediaUri(photoName, canonicalWidth);
      result = await downloadRemotePlacePhoto(photoUri);
    } catch (err) {
      if (
        effectivePlaceId &&
        err instanceof GooglePlacesApiError &&
        (err.status === 400 || err.status === 403 || err.status === 404 || err.status === 410)
      ) {
        transientPhotoCache.delete(effectivePlaceId);
        const refreshedName = await resolveFreshPhotoName(effectivePlaceId, safeIdx, true);
        if (refreshedName) {
          const retryUri = await getPlacePhotoMediaUri(refreshedName, canonicalWidth);
          result = await downloadRemotePlacePhoto(retryUri);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    setTransientPhotoBinary(cacheKey, result.buf, result.contentType);
    if (effectivePlaceId && initialPhotoName) {
      setTransientPhotoBinary(`place:${effectivePlaceId}:${safeIdx}`, result.buf, result.contentType);
    }
    return result;
  })();

  inFlightPhotoFetches.set(cacheKey, fetchTask);
  try {
    return await fetchTask;
  } finally {
    inFlightPhotoFetches.delete(cacheKey);
  }
}

function getServerPublicBaseUrl(_req?: express.Request): string {
  const configured = getConfiguredPublicBaseUrl(
    process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL
  );
  return configured;
}

function getServerPublicUrl(req: express.Request | undefined, slug: string): string {
  const base = getServerPublicBaseUrl(req);
  return buildPublicMinisiteUrl(slug, {
    publicBaseUrl: base,
  });
}

function extractRawQueryString(originalUrl: string): string {
  const idx = originalUrl.indexOf('?');
  return idx >= 0 ? originalUrl.slice(idx) : '';
}

async function fetchImagePartFromUrl(url: string, label?: string): Promise<ImageInputPart | null> {
  try {
    if (!url) return null;
    if (url.startsWith('data:image/')) {
      const m = url.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return null;
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return null;
      return { dataBase64: buf.toString('base64'), mimeType: m[1], label };
    }

    if (url.startsWith('/uploads/')) {
      const cleanName = path.basename(url);
      const localPath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'uploads'), cleanName);
      const ext = path.extname(cleanName).toLowerCase();
      const mimeType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
      if (fs.existsSync(localPath)) {
        if (!mimeType) return null;
        const buf = fs.readFileSync(localPath);
        if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return null;
        return { dataBase64: buf.toString('base64'), mimeType, label };
      }
      const dbAsset = await getMediaAssetByFilename(cleanName).catch(() => null);
      if (dbAsset && ['image/jpeg', 'image/png', 'image/webp'].includes(dbAsset.mimeType)) {
        if (dbAsset.sizeBytes > 0 && dbAsset.sizeBytes <= 3 * 1024 * 1024) {
          return { dataBase64: dbAsset.dataBase64, mimeType: dbAsset.mimeType, label };
        }
      }
      return null;
    }

    if (url.startsWith('/api/google/place-photo')) {
      const parsedQuery = new URL(`http://localhost${url}`);
      const photoName = parsedQuery.searchParams.get('name') || '';
      const placeId = parsedQuery.searchParams.get('placeId') || '';
      const idx = Number(parsedQuery.searchParams.get('idx') || 0);
      const loaded = await loadGooglePlacePhotoBinary({ placeId, photoName, idx }).catch(() => null);
      if (loaded && loaded.buf.length > 0 && loaded.buf.length <= 3 * 1024 * 1024) {
        const normalizedMime = loaded.contentType.split(';')[0].trim();
        if (['image/jpeg', 'image/png', 'image/webp'].includes(normalizedMime)) {
          return {
            dataBase64: loaded.buf.toString('base64'),
            mimeType: normalizedMime,
            label,
          };
        }
      }
      return null;
    }

    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.')
    ) {
      return null;
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!resp.ok) return null;
    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return null;
    const arrayBuf = await resp.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 3 * 1024 * 1024) return null;
    return {
      dataBase64: Buffer.from(arrayBuf).toString('base64'),
      mimeType: contentType,
      label,
    };
  } catch {
    return null;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const cleanName = path.basename(String(req.params.filename || ''));
    if (!cleanName || cleanName !== req.params.filename) {
      return res.status(400).end();
    }
    const localPath = path.join(UPLOADS_DIR, cleanName);
    if (fs.existsSync(localPath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.sendFile(localPath);
    }
    const asset = await getMediaAssetByFilename(cleanName);
    if (!asset) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(404).json({ error: 'Mídia não encontrada.' });
    }
    const buf = Buffer.from(asset.dataBase64, 'base64');
    try {
      fs.writeFileSync(localPath, buf);
    } catch {
      // non-fatal if disk is read-only
    }
    res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(buf);
  } catch (err) {
    return next(err);
  }
});
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '365d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  })
);
app.use((req, res, next) => {
  if (req.path === '/api/uploads') {
    return express.json({ limit: '42mb' })(req, res, next);
  }
  return express.json({ limit: '2mb' })(req, res, next);
});

const createBusinessSchema = z.object({
  name: z.string().min(2, 'Informe o nome da empresa.'),
  category: z.string().min(2, 'Informe a categoria ou segmento.'),
  city: z.string().optional().default(''),
  neighborhood: z.string().optional().default(''),
  state: z.string().optional().default(''),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  whatsapp: z.string().optional().default(''),
  website: z.string().optional().default(''),
  instagram: z.string().optional().default(''),
  googleMapsUrl: z.string().optional().default(''),
  googlePlaceId: z.string().optional(),
  isDemo: z.boolean().optional().default(false),
});

const googlePlaceDataSchema = z
  .object({
    description: z.string().optional(),
    types: z.array(z.string()).optional(),
    rating: z.number().nullable().optional(),
    userRatingCount: z.number().nullable().optional(),
    openNow: z.boolean().nullable().optional(),
    weekdayDescriptions: z.array(z.string()).optional(),
    googleMapsUri: z.string().optional(),
    directionsUri: z.string().optional(),
    reviewsUri: z.string().optional(),
    writeReviewUri: z.string().optional(),
    photosUri: z.string().optional(),
    placeUri: z.string().optional(),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
    reviews: z
      .array(
        z.object({
          authorName: z.string(),
          authorUri: z.string().optional(),
          authorPhotoUri: z.string().optional(),
          reviewUri: z.string().optional(),
          rating: z.number(),
          relativeTime: z.string(),
          text: z.string(),
        })
      )
      .optional(),
    photos: z
      .array(
        z.object({
          photoName: z.string(),
          authorAttributions: z
            .array(
              z.object({
                displayName: z.string(),
                uri: z.string().optional(),
                photoUri: z.string().optional(),
              })
            )
            .optional(),
        })
      )
      .optional(),
    firstPhotoName: z.string().optional(),
    firstPhotoAttribution: z
      .object({
        displayName: z.string(),
        uri: z.string().optional(),
      })
      .optional(),
  })
  .optional();

const createMinisiteSchema = z.object({
  queryOrUrl: z.string().optional().default(''),
  description: z.string().optional().default(''),
  businessId: z.number().int().positive().optional(),
  googlePlaceId: z.string().optional().default(''),
  confirmedName: z.string().optional().default(''),
  confirmedCategory: z.string().optional().default(''),
  confirmedCity: z.string().optional().default(''),
  confirmedNeighborhood: z.string().optional().default(''),
  confirmedState: z.string().optional().default(''),
  confirmedAddress: z.string().optional().default(''),
  confirmedPhone: z.string().optional().default(''),
  confirmedWhatsapp: z.string().optional().default(''),
  confirmedWebsite: z.string().optional().default(''),
  confirmedInstagram: z.string().optional().default(''),
  confirmedLogoUrl: z.string().optional().default(''),
  resolvedMapsUrl: z.string().optional().default(''),
  googlePlaceData: googlePlaceDataSchema,
  useAi: z.boolean().optional().default(true),
  isDemo: z.boolean().optional().default(false),
});

const updateMinisiteFullSchema = z.object({
  title: z.string().min(1, 'Informe o nome do minisite.').max(140),
  slug: z.string().optional(),
  templateId: z.string().min(1).max(60),
  theme: z.record(z.string(), z.unknown()),
  seo: z.record(z.string(), z.unknown()),
  blocks: z.array(
    z.object({
      blockType: z.string().min(1).max(50),
      visible: z.boolean(),
      content: z.record(z.string(), z.unknown()),
    })
  ),
  businessPatch: z
    .object({
      name: z.string().optional(),
      category: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      website: z.string().optional(),
      instagram: z.string().optional(),
    })
    .optional(),
});

const uploadMediaSchema = z.object({
  filename: z.string().min(1).max(160),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  dataBase64: z.string().min(16),
});

const updateStatusSchema = z.object({
  status: z.enum(MINISITE_STATUSES),
});

const updateTeamMemberSchema = z.object({
  role: z.enum(USER_ROLES),
  active: z.boolean(),
});

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'foco-leads-360',
    publicBaseUrl: getServerPublicBaseUrl(req),
    placesConfigured: Boolean(
      process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY
    ),
  });
});

// Public Maps JS API key loader (for @vis.gl/react-google-maps <APIProvider>)
app.get('/api/public/maps-config', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    apiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
  });
});

// Authenticated media upload (logo, capa, galeria)
app.post(
  '/api/uploads',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const parsed = uploadMediaSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Formato ou tamanho de mídia inválido.' });
      }
      const { mimeType, dataBase64 } = parsed.data;
      const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      const maxBytes = mimeType === 'video/mp4' ? 30 * 1024 * 1024 : 8 * 1024 * 1024;
      if (buffer.length === 0 || buffer.length > maxBytes) {
        return res.status(400).json({
          error:
            mimeType === 'video/mp4'
              ? 'Vídeo excede o limite de 30 MB.'
              : 'Imagem excede o limite de 8 MB.',
        });
      }

      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
      };
      const ext = extMap[mimeType] || 'bin';
      const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      await saveMediaAsset({
        filename: fileName,
        mimeType,
        dataBase64: cleanBase64,
        sizeBytes: buffer.length,
      });

      const targetPath = path.join(UPLOADS_DIR, fileName);
      try {
        fs.writeFileSync(targetPath, buffer);
      } catch {
        // DB already persisted durably
      }

      res.status(201).json({
        url: `/uploads/${fileName}`,
        mimeType,
        sizeBytes: buffer.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar arquivo.';
      res.status(500).json({ error: message });
    }
  }
);

// Strict admin login endpoint (fallback when Firebase Email/Password provider is disabled in Console)
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email.trim() || !password) {
      return res.status(400).json({
        error: 'Informe o e-mail e a senha de administrador para acessar.',
      });
    }

    const check = verifyAdminCredentialsServer(email, password);
    if (!check.ok) {
      return res.status(403).json({
        error: check.error,
      });
    }

    const profile = await getOrCreateProfile({
      uid: ADMIN_SESSION_UID,
      email: check.normalizedEmail,
      fullName: 'Administrador Feed em Foco',
    });

    if (!profile.active) {
      return res.status(403).json({
        error: 'Sua conta interna está desativada. Contate o administrador.',
      });
    }

    const token = issueAdminSessionToken();
    return res.json({
      token,
      profile,
      publicBaseUrl: getServerPublicBaseUrl(req),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha na autenticação.';
    return res.status(500).json({ error: message });
  }
});

// Authenticated user profile
app.get('/api/me', requireAuth, (req: AuthRequest, res) => {
  const authHeader = req.headers.authorization || '';
  const usingAdminSession = authHeader.startsWith('Bearer admin-session.');
  res.json({
    profile: req.profile,
    publicBaseUrl: getServerPublicBaseUrl(req),
    refreshedToken: usingAdminSession ? issueAdminSessionToken() : undefined,
  });
});

// Dashboard KPIs and recent activity
app.get('/api/dashboard', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const requestedDemo = req.query.demo === 'true';
    const isDemo = req.isDemoSession ? true : requestedDemo;
    const data = await getDashboardData(isDemo);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar dashboard.';
    res.status(500).json({ error: message });
  }
});

// Minisites listing
app.get('/api/minisites', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const requestedDemo = req.query.demo === 'true';
    const isDemo = req.isDemoSession ? true : requestedDemo;
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const status = typeof req.query.status === 'string' ? req.query.status : 'todos';
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 12);

    const data = await listMinisites({ isDemo, search, status, page, pageSize });
    res.json({
      ...data,
      publicBaseUrl: getServerPublicBaseUrl(req),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar minisites.';
    res.status(500).json({ error: message });
  }
});

// Resolve Google link (share.google, maps.app.goo.gl, google.com/maps) OR text query via Places API (New)
app.post('/api/google/resolve-link', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
    if (!input) {
      return res
        .status(400)
        .json({ error: 'Informe um link do Google (share.google / Maps) ou nome e cidade.' });
    }

    const parsed = await safeResolveGoogleMapsLink(input);
    if (parsed.isUrl && !parsed.validDomain) {
      return res.status(400).json({ error: parsed.notes, parsed, places: [] });
    }

    let places: GooglePlaceCandidate[] = [];
    let placesWarning: string | null = null;
    let placesErrorCode: string | null = null;

    const searchText = parsed.extractedQuery || parsed.extractedName || (!parsed.isUrl ? input : '');

    try {
      if (parsed.placeIdHint) {
        const direct = await getPlaceDetailsById(parsed.placeIdHint);
        if (direct) {
          cachePlacePhotos(direct.placeId, direct.photos);
          places = [direct];
        }
      }
      if (places.length === 0 && searchText) {
        places = await searchPlacesByText({
          textQuery: searchText,
          coordinates: parsed.coordinates,
          pageSize: 5,
        });
        for (const p of places) {
          cachePlacePhotos(p.placeId, p.photos);
        }
      }
    } catch (err) {
      if (err instanceof GoogleMapsQuotaError) {
        return res.status(429).json({
          error: err.message,
          code: err.code,
          parsed,
          places: [],
        });
      }
      if (err instanceof GooglePlacesApiError) {
        placesErrorCode = err.code;
        placesWarning =
          err.code === 'GMP_KEY_MISSING'
            ? 'Chave Google Places API não configurada no servidor. Os dados básicos do link foram extraídos para preenchimento manual.'
            : err.message;
      } else {
        placesWarning =
          err instanceof Error
            ? err.message
            : 'Não foi possível consultar a Google Places API no momento.';
      }
    }

    res.json({ parsed, places, placesWarning, placesErrorCode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao analisar o link.';
    res.status(500).json({ error: message });
  }
});

// Authoritative Place Details (New) endpoint by confirmed Place ID
app.get('/api/google/place-details/:placeId', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const placeId = String(req.params.placeId || '').trim();
    if (!placeId) {
      return res.status(400).json({ error: 'Place ID não informado.' });
    }
    const place = await getPlaceDetailsById(placeId);
    cachePlacePhotos(place.placeId, place.photos);
    const galleryPhotos = buildGoogleGalleryImages(place, 10);
    res.json({ place, galleryPhotos });
  } catch (error: unknown) {
    if (error instanceof GoogleMapsQuotaError) {
      return res.status(429).json({ error: error.message, code: error.code });
    }
    if (error instanceof GooglePlacesApiError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    const message = error instanceof Error ? error.message : 'Erro ao buscar Place Details.';
    res.status(500).json({ error: message });
  }
});

// Proxy authorized Google Place Photo directly without exposing API key, with transient coalescing & caching
app.get('/api/google/place-photo', async (req, res) => {
  try {
    const queryPlaceId = typeof req.query.placeId === 'string' ? req.query.placeId.trim() : '';
    const idx = Number(req.query.idx || 0);
    const photoName = typeof req.query.name === 'string' ? req.query.name.trim() : '';

    const { buf, contentType } = await loadGooglePlacePhotoBinary({
      placeId: queryPlaceId,
      photoName,
      idx,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(buf);
  } catch (error: unknown) {
    if (error instanceof GoogleMapsQuotaError) {
      return res.status(429).json({ error: error.message, code: error.code });
    }
    if (error instanceof GooglePlacesApiError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    const message = error instanceof Error ? error.message : 'Erro ao carregar foto.';
    res.status(500).json({ error: message });
  }
});

// Create minisite from confirmed Google Place / link / description (server-side Place Details + Gemini)
app.post(
  '/api/minisites',
  requireAuth,
  requirePermission('minisite:create'),
  async (req: AuthRequest, res) => {
    try {
      const parsedBody = createMinisiteSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: parsedBody.error.issues[0]?.message || 'Dados inválidos.',
        });
      }

      const payload = parsedBody.data;
      if (
        !payload.businessId &&
        !payload.queryOrUrl &&
        !payload.description &&
        !payload.confirmedName &&
        !payload.googlePlaceId
      ) {
        return res.status(400).json({
          error: 'Informe o link do Google, nome da empresa ou uma descrição do negócio.',
        });
      }

      const existingBiz = payload.businessId
        ? await getBusinessById(payload.businessId)
        : null;
      const effectivePlaceId = (
        payload.googlePlaceId ||
        existingBiz?.googlePlaceId ||
        ''
      ).trim();

      let authoritativePlace: GooglePlaceCandidate | null = null;
      if (effectivePlaceId) {
        try {
          authoritativePlace = await getPlaceDetailsById(effectivePlaceId);
          cachePlacePhotos(authoritativePlace.placeId, authoritativePlace.photos);
        } catch (err) {
          if (err instanceof GoogleMapsQuotaError) {
            return res.status(429).json({ error: err.message, code: err.code });
          }
          if (err instanceof GooglePlacesApiError && err.code === 'GMP_KEY_MISSING') {
            // Only fall back to client payload when API key is not configured on the server
            authoritativePlace = null;
          } else if (err instanceof GooglePlacesApiError) {
            return res.status(err.status).json({ error: err.message, code: err.code });
          } else {
            throw err;
          }
        }
      }

      const effectiveName =
        payload.confirmedName ||
        authoritativePlace?.name ||
        existingBiz?.name ||
        payload.queryOrUrl ||
        payload.description.split('\n')[0].slice(0, 60) ||
        'Nova Empresa';

      const effectiveCategory =
        payload.confirmedCategory ||
        authoritativePlace?.category ||
        existingBiz?.category ||
        '';
      const effectiveCity =
        payload.confirmedCity || authoritativePlace?.city || existingBiz?.city || '';
      const effectiveNeighborhood =
        payload.confirmedNeighborhood ||
        authoritativePlace?.neighborhood ||
        existingBiz?.neighborhood ||
        '';
      const effectiveState =
        payload.confirmedState || authoritativePlace?.state || existingBiz?.state || '';
      const effectiveAddress =
        payload.confirmedAddress ||
        authoritativePlace?.formattedAddress ||
        existingBiz?.address ||
        '';
      const effectivePhone =
        payload.confirmedPhone || authoritativePlace?.phone || existingBiz?.phone || '';
      const effectiveWhatsapp =
        payload.confirmedWhatsapp ||
        authoritativePlace?.whatsappCandidate ||
        existingBiz?.whatsapp ||
        '';
      const effectiveWebsite =
        payload.confirmedWebsite ||
        authoritativePlace?.website ||
        existingBiz?.website ||
        '';
      const effectiveInstagram =
        payload.confirmedInstagram || existingBiz?.instagram || '';
      const effectiveMapsUrl =
        authoritativePlace?.googleMapsUri ||
        payload.resolvedMapsUrl ||
        payload.googlePlaceData?.googleMapsUri ||
        existingBiz?.googleMapsUrl ||
        '';

      const effectivePlaceData = authoritativePlace
        ? {
            placeId: authoritativePlace.placeId,
            description: authoritativePlace.description,
            types: authoritativePlace.types,
            rating: authoritativePlace.rating,
            userRatingCount: authoritativePlace.userRatingCount,
            openNow: authoritativePlace.openNow,
            weekdayDescriptions: authoritativePlace.weekdayDescriptions,
            googleMapsUri: authoritativePlace.googleMapsUri,
            directionsUri: authoritativePlace.directionsUri,
            reviewsUri: authoritativePlace.reviewsUri,
            writeReviewUri: authoritativePlace.writeReviewUri,
            photosUri: authoritativePlace.photosUri,
            location: authoritativePlace.location,
            reviews: authoritativePlace.reviews,
            photos: authoritativePlace.photos,
          }
        : payload.googlePlaceData
          ? {
              placeId: effectivePlaceId,
              ...payload.googlePlaceData,
            }
          : null;

      const rawPhotos = effectivePlaceData?.photos || [];
      const firstPhotoName =
        rawPhotos[0]?.photoName || payload.googlePlaceData?.firstPhotoName || '';

      let aiStructured: Awaited<ReturnType<typeof structureMinisiteWithGemini>> | null = null;
      let aiErrorNote: string | null = null;

      if (
        payload.useAi &&
        process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ) {
        try {
          const imageParts: ImageInputPart[] = [];
          if (effectivePlaceId || firstPhotoName) {
            const loadedPhoto = await Promise.race([
              loadGooglePlacePhotoBinary({
                placeId: effectivePlaceId,
                photoName: firstPhotoName,
                idx: 0,
              }).catch(() => null),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 2200)),
            ]);
            if (loadedPhoto && loadedPhoto.buf.length > 0 && loadedPhoto.buf.length <= 3 * 1024 * 1024) {
              const normalizedMime = loadedPhoto.contentType.split(';')[0].trim();
              if (['image/jpeg', 'image/png', 'image/webp'].includes(normalizedMime)) {
                imageParts.push({
                  dataBase64: loadedPhoto.buf.toString('base64'),
                  mimeType: normalizedMime,
                  label: 'fachada',
                });
              }
            }
          }

          aiStructured = await structureMinisiteWithGemini({
            companyNameOrQuery: effectiveName,
            category: effectiveCategory,
            types: effectivePlaceData?.types,
            city: effectiveCity,
            address: effectiveAddress,
            phone: effectivePhone || effectiveWhatsapp,
            website: effectiveWebsite,
            googleDescription: effectivePlaceData?.description,
            weekdayDescriptions: effectivePlaceData?.weekdayDescriptions,
            rating: effectivePlaceData?.rating,
            userRatingCount: effectivePlaceData?.userRatingCount,
            reviewsSample: effectivePlaceData?.reviews?.slice(0, 3).map((r) => r.text),
            description: payload.description,
            resolvedMapsUrl: effectiveMapsUrl || null,
            imageParts,
          });
        } catch (err) {
          aiErrorNote = formatGeminiError(err).message;
        }
      }

      let targetBusinessId = payload.businessId;
      if (!targetBusinessId) {
        const createdBiz = await createBusinessRecord({
          name: payload.confirmedName || authoritativePlace?.name || aiStructured?.business.name || effectiveName,
          category:
            effectiveCategory || aiStructured?.business.category || 'Negócio local',
          city: effectiveCity || aiStructured?.business.city || '',
          neighborhood: effectiveNeighborhood || '',
          state: effectiveState || '',
          address: effectiveAddress || aiStructured?.business.address || '',
          phone: effectivePhone || aiStructured?.business.phone || '',
          whatsapp: effectiveWhatsapp || aiStructured?.business.whatsapp || '',
          website: effectiveWebsite || '',
          instagram: effectiveInstagram || aiStructured?.business.instagram || '',
          googlePlaceId: effectivePlaceId || undefined,
          googleMapsUrl: effectiveMapsUrl,
          sourceMetadata: {
            origin: effectivePlaceId
              ? 'google_places_api_new'
              : aiStructured
                ? 'gemini_structured'
                : 'manual',
            googleDescription: effectivePlaceData?.description || '',
            rating: effectivePlaceData?.rating ?? null,
            userRatingCount: effectivePlaceData?.userRatingCount ?? null,
            needsReviewFields: aiStructured?.needsReviewFields ?? [],
          },
          isDemo: payload.isDemo,
          actorId: req.profile?.id ?? null,
        });
        targetBusinessId = createdBiz.id;
      } else if (authoritativePlace) {
        await updateBusinessGoogleData({
          businessId: targetBusinessId,
          address: effectiveAddress,
          phone: effectivePhone,
          website: effectiveWebsite,
          googleMapsUrl: effectiveMapsUrl,
          googlePlaceId: authoritativePlace.placeId,
          sourceMetadataPatch: {
            origin: 'google_places_api_new',
            googleDescription: authoritativePlace.description || '',
            rating: authoritativePlace.rating,
            userRatingCount: authoritativePlace.userRatingCount,
          },
        });
      }

      const rawFinalName =
        payload.confirmedName ||
        authoritativePlace?.name ||
        aiStructured?.business.name ||
        effectiveName;
      const finalName = extractCleanBrandTitle(rawFinalName) || rawFinalName;
      const finalCategory =
        effectiveCategory || aiStructured?.business.category || 'Empresa local';
      const fallbackDesc =
        effectivePlaceData?.description ||
        payload.description ||
        `${finalCategory}${effectiveCity ? ` em ${effectiveCity}` : ''}`;

      const heroTitle =
        extractCleanBrandTitle(aiStructured?.hero.title || '') || finalName;
      const heroSubtitle = (aiStructured?.hero.subtitle || fallbackDesc).slice(0, 180);

      const finalPhone = effectivePhone || aiStructured?.business.phone || '';
      const finalWhatsapp = effectiveWhatsapp || aiStructured?.business.whatsapp || '';
      const finalAddress = effectiveAddress || aiStructured?.business.address || '';
      const finalInstagram = effectiveInstagram || aiStructured?.business.instagram || '';

      const firstPhotoAttr =
        rawPhotos[0]?.authorAttributions?.[0] ||
        payload.googlePlaceData?.firstPhotoAttribution ||
        null;

      const coverImageProxy =
        rawPhotos.length > 0 || firstPhotoName
          ? buildPlacePhotoProxyUrl(effectivePlaceId, 0, 1080, firstPhotoName)
          : '';

      const galleryImages = authoritativePlace
        ? buildGoogleGalleryImages(authoritativePlace, 8)
        : rawPhotos
            .slice(0, 8)
            .map((p, idx) => ({
              url: buildPlacePhotoProxyUrl(effectivePlaceId, idx, 960, p.photoName),
              caption: '',
              attributionName: p.authorAttributions?.[0]?.displayName || 'Google Maps',
              attributionUri: p.authorAttributions?.[0]?.uri || '',
              originUri: effectivePlaceData?.photosUri || effectiveMapsUrl || '',
              googlePlaceId: effectivePlaceId || undefined,
              photoIndex: idx,
            }))
            .filter((img) => Boolean(img.url));

      const templateId = aiStructured?.templateId || 'modelo_generico';
      const defaultPalette = getDefaultPaletteForTemplate(templateId).theme;
      const enforcedColors = enforceThemePaletteContrast({
        primaryColor: aiStructured?.theme?.primaryColor || defaultPalette.primaryColor,
        secondaryColor: aiStructured?.theme?.secondaryColor || defaultPalette.secondaryColor,
        accentColor: aiStructured?.theme?.accentColor || defaultPalette.accentColor,
        backgroundColor: aiStructured?.theme?.backgroundColor || defaultPalette.backgroundColor,
        surfaceColor: aiStructured?.theme?.surfaceColor || defaultPalette.surfaceColor,
        serviceCardBg: aiStructured?.theme?.serviceCardBg,
        textColor: aiStructured?.theme?.textColor || defaultPalette.textColor,
        buttonTextColor: aiStructured?.theme?.buttonTextColor || defaultPalette.buttonTextColor,
      });

      const themePayload = {
        ...enforcedColors,
        buttonStyle: 'solid',
        buttonRadius: 'full',
        heroStyle: 'card',
        fontFamily: aiStructured?.theme?.fontFamily || 'Plus Jakarta Sans',
        brandAnalysisSummary:
          aiStructured?.theme?.brandAnalysisSummary ||
          'Paleta harmonizada automaticamente com base no segmento e identidade visual.',
        coverImage: coverImageProxy,
        coverVideo: '',
        logoImage: resolveImportedLogoImage({
          identifiedLogoUrl: payload.confirmedLogoUrl,
          placeId: effectivePlaceId,
          photos: rawPhotos,
        }),
        fixedWhatsappButton: Boolean(finalWhatsapp || finalPhone),
        showOpenBadge: effectivePlaceData?.openNow != null,
        openBadgeText: formatOpenBadgeText(
          effectivePlaceData?.openNow,
          effectivePlaceData?.weekdayDescriptions
        ),
        photoAttribution: firstPhotoAttr,
        placePhotosUri: effectivePlaceData?.photosUri || effectiveMapsUrl || '',
      };

      const bodyText =
        aiStructured?.institutionalText ||
        effectivePlaceData?.description ||
        payload.description ||
        '';

      const blocks = buildMinisiteBlocksFromGooglePlace({
        finalName,
        heroTitle,
        heroSubtitle,
        coverImageProxy,
        firstPhotoAttr,
        finalPhone,
        finalWhatsapp,
        finalAddress,
        finalInstagram,
        confirmedWebsite: effectiveWebsite,
        resolvedMapsUrl: effectiveMapsUrl,
        bodyText,
        placeData: effectivePlaceData,
        galleryImages,
        aiStructured,
      });

      const minisite = await createMinisiteRecord({
        businessId: targetBusinessId,
        title: finalName,
        status: payload.isDemo ? 'demonstracao' : 'rascunho',
        templateId,
        theme: themePayload,
        seo: {
          title: aiStructured?.seo?.title || `${finalName} | Foco Leads 360`,
          description: aiStructured?.seo?.description || heroSubtitle,
          noIndex: !payload.isDemo,
        },
        blocks,
        isDemo: payload.isDemo,
        actorId: req.profile?.id ?? null,
      });

      if (!minisite?.slug) {
        return res.status(500).json({ error: 'Falha ao gerar o endereço (slug) do minisite.' });
      }

      res.status(201).json({
        minisite,
        publicUrl: getServerPublicUrl(req, minisite.slug),
        aiUsed: Boolean(aiStructured),
        aiNote: aiErrorNote,
      });
    } catch (error: unknown) {
      if (error instanceof SlugValidationError) {
        return res.status(error.status).json({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Erro ao criar minisite.';
      res.status(500).json({ error: message });
    }
  }
);

// Update minisite publication status (RBAC enforced on 'publicado')
app.patch(
  '/api/minisites/:id/status',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const minisiteId = Number(req.params.id);
      if (!Number.isInteger(minisiteId) || minisiteId <= 0) {
        return res.status(400).json({ error: 'ID de minisite inválido.' });
      }

      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Status de publicação inválido.' });
      }

      const nextStatus = parsed.data.status;

      if (nextStatus === 'publicado' && req.profile?.role !== 'administrador') {
        return res.status(403).json({
          error:
            'A publicação oficial do minisite exige autorização explícita de um Administrador.',
        });
      }

      const updated = await updateMinisiteStatus({
        minisiteId,
        status: nextStatus,
        actorId: req.profile!.id,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Minisite não encontrado.' });
      }

      res.json({
        minisite: updated,
        publicUrl: updated.status === 'publicado' ? getServerPublicUrl(req, updated.slug) : null,
      });
    } catch (error: unknown) {
      if (error instanceof SlugValidationError) {
        return res.status(error.status).json({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Erro ao atualizar status.';
      res.status(500).json({ error: message });
    }
  }
);

// Explicit Publish / Republish snapshot endpoint
app.post(
  '/api/minisites/:id/publish',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const minisiteId = Number(req.params.id);
      if (!Number.isInteger(minisiteId) || minisiteId <= 0) {
        return res.status(400).json({ error: 'ID de minisite inválido.' });
      }
      if (req.profile?.role !== 'administrador') {
        return res.status(403).json({
          error: 'A publicação oficial do minisite exige autorização de um Administrador.',
        });
      }
      const updated = await publishMinisiteSnapshot({
        minisiteId,
        actorId: req.profile!.id,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Minisite não encontrado.' });
      }
      res.json({
        minisite: updated,
        publicUrl: getServerPublicUrl(req, updated.slug),
      });
    } catch (error: unknown) {
      if (error instanceof SlugValidationError) {
        return res.status(error.status).json({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Erro ao publicar minisite.';
      res.status(500).json({ error: message });
    }
  }
);

// Explicit Unpublish endpoint (reverts live URL to HTTP 404)
app.post(
  '/api/minisites/:id/unpublish',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const minisiteId = Number(req.params.id);
      if (!Number.isInteger(minisiteId) || minisiteId <= 0) {
        return res.status(400).json({ error: 'ID de minisite inválido.' });
      }
      const nextStatusRaw = typeof req.body?.status === 'string' ? req.body.status : 'rascunho';
      const nextStatus =
        nextStatusRaw === 'demonstracao' || nextStatusRaw === 'desativado'
          ? nextStatusRaw
          : 'rascunho';

      const updated = await unpublishMinisite({
        minisiteId,
        nextStatus,
        actorId: req.profile!.id,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Minisite não encontrado.' });
      }
      res.json({ minisite: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao despublicar minisite.';
      res.status(500).json({ error: message });
    }
  }
);

// Idempotently refresh Google Places data for an existing minisite without overwriting manual media
app.post(
  '/api/minisites/:id/refresh-google',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de minisite inválido.' });
      }

      const detail = await getMinisiteDetail({ id, incrementViews: false });
      if (!detail) {
        return res.status(404).json({ error: 'Minisite não encontrado.' });
      }

      const requestedPlaceId =
        typeof req.body?.placeId === 'string' ? req.body.placeId.trim() : '';
      const targetPlaceId = requestedPlaceId || detail.business?.googlePlaceId || '';

      if (!targetPlaceId) {
        return res.status(400).json({
          error:
            'Este minisite não possui um Place ID do Google vinculado. Informe o Place ID ou vincule a ficha na criação.',
        });
      }

      const place = await getPlaceDetailsById(targetPlaceId, { forceRefresh: true });
      clearTransientPhotoCacheForPlace(place.placeId);
      cachePlacePhotos(place.placeId, place.photos);

      const merged = mergeGooglePlaceRefresh({
        currentTheme: (detail.theme || {}) as MinisiteTheme,
        currentBlocks: (detail.blocks || []).map((b) => ({
          blockType: b.blockType,
          visible: b.visible,
          content: (b.content || {}) as Record<string, unknown>,
        })),
        currentBusiness: detail.business || {},
        place,
      });

      await updateBusinessGoogleData({
        businessId: detail.businessId,
        ...merged.businessPatch,
      });

      const refreshed = await updateMinisiteFull({
        minisiteId: id,
        title: detail.title,
        templateId: detail.templateId,
        theme: merged.theme as unknown as Record<string, unknown>,
        seo: (detail.seo || {}) as Record<string, unknown>,
        blocks: merged.blocks,
        actorId: req.profile!.id,
      });

      if (!refreshed) {
        return res.status(404).json({ error: 'Minisite não encontrado após atualização do Google.' });
      }

      const googlePhotos = buildGoogleGalleryImages(place, 10);

      res.json({
        minisite: refreshed,
        googlePhotos,
        summary: merged.summary,
      });
    } catch (error: unknown) {
      if (error instanceof GoogleMapsQuotaError) {
        return res.status(429).json({ error: error.message, code: error.code });
      }
      if (error instanceof GooglePlacesApiError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      const message = error instanceof Error ? error.message : 'Erro ao atualizar dados do Google.';
      res.status(500).json({ error: message });
    }
  }
);

// Get minisite detail (internal)
app.get('/api/minisites/:id', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const detail = await getMinisiteDetail({ id, incrementViews: false });
    if (!detail) {
      return res.status(404).json({ error: 'Minisite não encontrado.' });
    }
    if (req.isDemoSession && !detail.isDemo) {
      return res.status(403).json({ error: 'Acesso negado no modo demonstração.' });
    }
    res.json({
      minisite: detail,
      publicUrl: getServerPublicUrl(req, detail.slug),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar minisite.';
    res.status(500).json({ error: message });
  }
});

// Save full minisite editor state (content, blocks, theme, SEO) + create version snapshot
app.put(
  '/api/minisites/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de minisite inválido.' });
      }
      const parsed = updateMinisiteFullSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Dados de edição inválidos.',
        });
      }

      const updated = await updateMinisiteFull({
        minisiteId: id,
        ...parsed.data,
        actorId: req.profile!.id,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Minisite não encontrado.' });
      }

      res.json({
        minisite: updated,
        publicUrl: getServerPublicUrl(req, updated.slug),
      });
    } catch (error: unknown) {
      if (error instanceof SlugValidationError) {
        return res.status(error.status).json({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Erro ao salvar minisite.';
      const statusCode = message.includes('já está em uso') ? 409 : 500;
      res.status(statusCode).json({ error: message });
    }
  }
);

// Delete a minisite cleanly
app.delete(
  '/api/minisites/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de minisite inválido.' });
      }
      const deleted = await deleteMinisiteRecord({
        minisiteId: id,
        actorId: req.profile!.id,
      });
      if (!deleted) {
        return res.status(404).json({ error: 'Minisite não encontrado.' });
      }
      res.json({ deleted: true, id: deleted.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao excluir minisite.';
      res.status(500).json({ error: message });
    }
  }
);

// Reanalyze visual identity / brand palette from current Logo & Cover media
app.post(
  '/api/minisites/:id/analyze-palette',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const startedAt = Date.now();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de minisite inválido.' });
      }

      const body = (req.body || {}) as {
        logoImage?: string;
        coverImage?: string;
        fallbackImage?: string;
        templateId?: string;
        businessName?: string;
        category?: string;
      };

      const logoUrlBody = body.logoImage || '';
      const coverUrlBody = body.coverImage || body.fallbackImage || '';

      const [detail, logoPartPre, coverPartPre] = await Promise.all([
        getMinisiteDetail({ id, incrementViews: false }),
        logoUrlBody ? fetchImagePartFromUrl(logoUrlBody, 'logo') : Promise.resolve(null),
        coverUrlBody ? fetchImagePartFromUrl(coverUrlBody, 'capa') : Promise.resolve(null),
      ]);

      if (!detail) {
        return res.status(404).json({ error: 'Minisite não encontrado.' });
      }

      const currentTheme = (detail.theme || {}) as Record<string, unknown>;
      const fallbackLogoUrl = !logoUrlBody ? String(currentTheme.logoImage || '') : '';
      const fallbackCoverUrl = !coverUrlBody ? String(currentTheme.coverImage || '') : '';

      const [logoPartExtra, coverPartExtra] = await Promise.all([
        !logoPartPre && fallbackLogoUrl
          ? fetchImagePartFromUrl(fallbackLogoUrl, 'logo')
          : Promise.resolve(null),
        !coverPartPre && fallbackCoverUrl
          ? fetchImagePartFromUrl(fallbackCoverUrl, 'capa')
          : Promise.resolve(null),
      ]);

      const imageParts: ImageInputPart[] = [
        logoPartPre || logoPartExtra,
        coverPartPre || coverPartExtra,
      ].filter((p): p is ImageInputPart => Boolean(p));

      const palette = await analyzeBrandPaletteWithGemini({
        businessName: body.businessName || detail.business?.name || detail.title,
        category: body.category || detail.business?.category || '',
        templateId: body.templateId || detail.templateId,
        imageParts,
      });

      res.json({ palette, elapsedMs: Date.now() - startedAt });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  }
);

// List minisite version history
app.get(
  '/api/minisites/:id/versions',
  requireAuth,
  requirePermission('minisite:read'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido.' });
      }
      const versions = await listMinisiteVersions(id);
      res.json({ versions });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao listar versões.';
      res.status(500).json({ error: message });
    }
  }
);

// Restore a specific minisite version
app.post(
  '/api/minisites/:id/restore/:versionId',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const minisiteId = Number(req.params.id);
      const versionId = Number(req.params.versionId);
      if (!Number.isInteger(minisiteId) || !Number.isInteger(versionId)) {
        return res.status(400).json({ error: 'Identificadores inválidos.' });
      }
      const restored = await restoreMinisiteVersion({
        minisiteId,
        versionId,
        actorId: req.profile!.id,
      });
      if (!restored) {
        return res.status(404).json({ error: 'Versão não encontrada.' });
      }
      res.json({ minisite: restored });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao restaurar versão.';
      res.status(500).json({ error: message });
    }
  }
);

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const sites = await listIndexableMinisiteSlugs();
    const entries = sites.map(({ slug }) => {
      const url = getServerPublicUrl(req, slug).replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      return '<url><loc>' + url + '</loc></url>';
    });
    res.type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      entries.join('') + '</urlset>'
    );
  } catch (error) {
    next(error);
  }
});

// Anonymous public published snapshot endpoint for /:slug (and legacy /LinkFoco/:slug, /s/:slug) — strictly returns 404 unless published
app.get('/api/public/site/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const isPrefetch =
      req.query.prefetch === '1' || req.headers['x-minisite-prefetch'] === '1';
    const lookup = await resolvePublicMinisiteLookup(slug, !isPrefetch);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (lookup.kind === 'not_found') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(404).json({ error: 'Minisite não encontrado ou não publicado.' });
    }

    if (lookup.kind === 'redirect') {
      const qs = extractRawQueryString(req.originalUrl);
      const redirectPath = `${buildPublicMinisitePath(lookup.targetSlug)}${qs}`;
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json({
        redirect: true,
        targetSlug: lookup.targetSlug,
        redirectPath,
        publicUrl: `${getServerPublicUrl(req, lookup.targetSlug)}${qs}`,
      });
    }

    const updatedMs = new Date(lookup.updatedAt).getTime();
    const publishedMs = lookup.publishedAt ? new Date(lookup.publishedAt).getTime() : 0;
    const etag = `W/"ms-${lookup.minisiteId}-${lookup.canonicalSlug}-${updatedMs}-${publishedMs}"`;

    res.setHeader('ETag', etag);
    res.setHeader(
      'Cache-Control',
      'public, max-age=30, s-maxage=120, stale-while-revalidate=300'
    );
    res.setHeader('Vary', 'Accept-Encoding');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json({
      minisite: lookup.minisite,
      publicUrl: getServerPublicUrl(req, lookup.canonicalSlug),
    });
  } catch (error: unknown) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const message = error instanceof Error ? error.message : 'Erro ao carregar minisite público.';
    res.status(500).json({ error: message });
  }
});

// Internal/Demo preview endpoint by slug (/demo/:slug) — never cached publicly
app.get('/api/public/minisite/:slug', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const slug = req.params.slug;
    const detail = await getMinisiteDetail({ slug, incrementViews: true });
    if (!detail || detail.status === 'desativado') {
      return res.status(404).json({ error: 'Minisite não encontrado ou desativado.' });
    }
    res.json({
      minisite: detail,
      publicUrl: getServerPublicUrl(req, detail.slug),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar prévia.';
    res.status(500).json({ error: message });
  }
});

// Businesses listing & manual creation
app.get('/api/businesses', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const requestedDemo = req.query.demo === 'true';
    const isDemo = req.isDemoSession ? true : requestedDemo;
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const items = await listBusinesses({ isDemo, search });
    res.json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar empresas.';
    res.status(500).json({ error: message });
  }
});

app.post(
  '/api/businesses',
  requireAuth,
  requirePermission('business:create'),
  async (req: AuthRequest, res) => {
    try {
      const parsed = createBusinessSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Dados inválidos.',
        });
      }

      const business = await createBusinessRecord({
        ...parsed.data,
        actorId: req.profile?.id ?? null,
      });

      res.status(201).json({ business });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao cadastrar empresa.';
      res.status(500).json({ error: message });
    }
  }
);

// Team & Permissions (Admin only)
app.get(
  '/api/team',
  requireAuth,
  requirePermission('team:manage'),
  async (_req: AuthRequest, res) => {
    try {
      const members = await listProfiles();
      res.json({ members });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao listar equipe.';
      res.status(500).json({ error: message });
    }
  }
);

app.patch(
  '/api/team/:id',
  requireAuth,
  requirePermission('team:manage'),
  async (req: AuthRequest, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'ID inválido.' });
      }
      const parsed = updateTeamMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Papel ou status inválido.' });
      }

      const updated = await updateProfileRoleAndStatus({
        targetId,
        role: parsed.data.role,
        active: parsed.data.active,
        actorId: req.profile!.id,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Colaborador não encontrado.' });
      }
      res.json({ member: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar colaborador.';
      res.status(500).json({ error: message });
    }
  }
);

// Audit Logs
app.get(
  '/api/audit-logs',
  requireAuth,
  requirePermission('logs:read'),
  async (_req: AuthRequest, res) => {
    try {
      const logs = await listAuditLogs(50);
      res.json({ logs });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar logs.';
      res.status(500).json({ error: message });
    }
  }
);

// ---- PROSPECTION ROUTES (/prospeccao) ----
app.get('/api/prospeccao/usage', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const requestedDemo = req.query.demo === 'true';
    const isDemo = req.isDemoSession ? true : requestedDemo;
    const usage = await getMonthlyProspectingUsage(req.profile?.id ?? null);
    const history = await listProspectingSearches(isDemo);
    res.json({ usage, history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao consultar uso.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/prospeccao/buscar', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      country: z.string().optional().default('BR'),
      state: z.string().optional().default(''),
      city: z.string().min(2, 'Informe a cidade para buscar.'),
      niche: z.string().min(2, 'Informe o nicho / segmento.'),
      neighborhoods: z.string().optional().default(''),
      isDemo: z.boolean().optional().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
    }

    const neighborhoodsList = parsed.data.neighborhoods
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    const searchResult = await searchPlacesProspecting({
      country: parsed.data.country,
      state: parsed.data.state,
      city: parsed.data.city,
      niche: parsed.data.niche,
      neighborhoods: neighborhoodsList,
    });

    const isDemo = req.isDemoSession ? true : parsed.data.isDemo;
    await saveProspectingSearch({
      country: parsed.data.country,
      state: parsed.data.state,
      city: parsed.data.city,
      niche: parsed.data.niche,
      neighborhoods: parsed.data.neighborhoods,
      requestsUsed: searchResult.requestsUsed,
      results: searchResult.results.map((r) => ({
        placeId: r.placeId,
        name: r.name,
        rating: r.rating,
        userRatingCount: r.userRatingCount,
        leadScore: r.leadScore,
      })),
      isDemo,
      actorId: req.profile?.id ?? null,
    });

    const usage = await getMonthlyProspectingUsage(req.profile?.id ?? null);
    res.json({
      ...searchResult,
      usage,
    });
  } catch (error: unknown) {
    if (error instanceof GoogleMapsQuotaError) {
      return res.status(429).json({ error: error.message, code: error.code });
    }
    const message = error instanceof Error ? error.message : 'Erro ao buscar comércios.';
    res.status(500).json({ error: message });
  }
});

// ---- CRM / PAINEL DE LEADS ROUTES ----
app.get('/api/crm/leads', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const requestedDemo = req.query.demo === 'true';
    const isDemo = req.isDemoSession ? true : requestedDemo;
    const leads = await listCrmLeads(isDemo);
    const settings = await getOperatorSettings(req.profile?.id ?? null);
    res.json({ leads, stages: CRM_STAGES, settings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar leads.';
    res.status(500).json({ error: message });
  }
});

app.post(
  '/api/crm/leads',
  requireAuth,
  requirePermission('minisite:create'),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        businessId: z.number().int().positive().optional(),
        minisiteId: z.number().int().positive().nullable().optional(),
        stage: z.string().optional().default('novo'),
        estimatedValue: z.number().int().min(0).optional().default(9700),
        serviceName: z.string().optional().default('Minisite comercial'),
        leadScore: z.number().int().min(0).max(100).optional().default(0),
        competitorName: z.string().optional().default(''),
        competitorReviews: z.number().int().min(0).optional().default(0),
        gapReviews: z.number().int().min(0).optional().default(0),
        notes: z.string().optional().default(''),
        isDemo: z.boolean().optional().default(false),
        // Optional inline business creation from Prospection
        businessPayload: z
          .object({
            name: z.string().min(2),
            category: z.string().default('Empresa local'),
            city: z.string().optional().default(''),
            neighborhood: z.string().optional().default(''),
            state: z.string().optional().default(''),
            address: z.string().optional().default(''),
            phone: z.string().optional().default(''),
            whatsapp: z.string().optional().default(''),
            website: z.string().optional().default(''),
            googleMapsUrl: z.string().optional().default(''),
            googlePlaceId: z.string().optional(),
            sourceMetadata: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
      }

      let businessId = parsed.data.businessId;
      if (!businessId && parsed.data.businessPayload) {
        const createdBiz = await createBusinessRecord({
          ...parsed.data.businessPayload,
          isDemo: parsed.data.isDemo,
          actorId: req.profile!.id,
        });
        businessId = createdBiz.id;
      }

      if (!businessId) {
        return res.status(400).json({ error: 'Informe a empresa do lead.' });
      }

      const lead = await createCrmLead({
        businessId,
        minisiteId: parsed.data.minisiteId ?? null,
        stage: parsed.data.stage,
        estimatedValue: parsed.data.estimatedValue,
        serviceName: parsed.data.serviceName,
        leadScore: parsed.data.leadScore,
        competitorName: parsed.data.competitorName,
        competitorReviews: parsed.data.competitorReviews,
        gapReviews: parsed.data.gapReviews,
        notes: parsed.data.notes,
        isDemo: parsed.data.isDemo,
        actorId: req.profile!.id,
      });

      res.status(201).json({ lead });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao criar lead.';
      res.status(500).json({ error: message });
    }
  }
);

app.patch(
  '/api/crm/leads/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido.' });
      }
      const schema = z.object({
        stage: z.enum(['novo', 'chamado', 'respondeu', 'negociando', 'fechou', 'perdido']).optional(),
        estimatedValue: z.number().int().min(0).optional(),
        notes: z.string().optional(),
        minisiteId: z.number().int().positive().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Dados de atualização inválidos.' });
      }
      const updated = await updateCrmLead({
        id,
        ...parsed.data,
        actorId: req.profile!.id,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      res.json({ lead: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar lead.';
      res.status(500).json({ error: message });
    }
  }
);

app.delete(
  '/api/crm/leads/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const deleted = await deleteCrmLead(id);
      if (!deleted) return res.status(404).json({ error: 'Lead não encontrado.' });
      res.json({ deleted: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao remover lead.';
      res.status(500).json({ error: message });
    }
  }
);

// ---- DYNAMIC QR CODES ROUTES ----
app.get('/api/qr-codes', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const requestedDemo = req.query.demo === 'true';
    const isDemo = req.isDemoSession ? true : requestedDemo;
    const items = await listQrCodes(isDemo);
    res.json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar QR Codes.';
    res.status(500).json({ error: message });
  }
});

app.post(
  '/api/qr-codes',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        label: z.string().min(2, 'Informe o nome da placa ou QR Code.'),
        destinationType: z.string().default('minisite'),
        destinationUrl: z.string().url('Informe uma URL de destino válida (https://...).'),
        businessId: z.number().int().positive().nullable().optional(),
        minisiteId: z.number().int().positive().nullable().optional(),
        isDemo: z.boolean().optional().default(false),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
      }
      const qr = await createQrCode({
        ...parsed.data,
        actorId: req.profile!.id,
      });
      res.status(201).json({ qrCode: qr });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao criar QR Code.';
      res.status(500).json({ error: message });
    }
  }
);

app.patch(
  '/api/qr-codes/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({
        label: z.string().min(2).optional(),
        destinationType: z.string().optional(),
        destinationUrl: z.string().url().optional(),
        active: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Dados inválidos para atualizar QR Code.' });
      }
      const updated = await updateQrCode({ id, ...parsed.data });
      if (!updated) return res.status(404).json({ error: 'QR Code não encontrado.' });
      res.json({ qrCode: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar QR Code.';
      res.status(500).json({ error: message });
    }
  }
);

app.delete(
  '/api/qr-codes/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de QR Code inválido.' });
      }
      const deleted = await deleteQrCode(id);
      if (!deleted) return res.status(404).json({ error: 'QR Code não encontrado.' });
      res.json({ deleted: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao excluir QR Code.';
      res.status(500).json({ error: message });
    }
  }
);

// Public dynamic QR Code short redirector (/q/:code)
app.get('/q/:code', async (req, res) => {
  try {
    const record = await resolveAndTrackQrCode(req.params.code);
    if (!record) {
      return res
        .status(404)
        .send(
          '<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>QR Code pausado ou não encontrado</h2><p>Este código foi desativado pelo administrador no Foco Leads 360.</p></body></html>'
        );
    }
    res.redirect(302, record.destinationUrl);
  } catch {
    res.status(500).send('Erro ao redirecionar QR Code.');
  }
});

// ---- COMMERCIAL SCRIPTS ROUTES ----
app.get('/api/scripts', optionalAuthOrDemo, async (_req: AuthRequest, res) => {
  try {
    const scripts = await listCommercialScripts();
    res.json({ scripts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar scripts.';
    res.status(500).json({ error: message });
  }
});

app.post(
  '/api/scripts',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        stageKey: z.string().min(1),
        stageOrder: z.number().int().min(1).max(20),
        stageTitle: z.string().min(1),
        title: z.string().min(2, 'Informe o título do script.'),
        body: z.string().min(2, 'Informe o texto do script.'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
      }
      const script = await createCommercialScript({
        ...parsed.data,
        actorId: req.profile!.id,
      });
      res.status(201).json({ script });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao criar script.';
      res.status(500).json({ error: message });
    }
  }
);

app.put(
  '/api/scripts/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({
        title: z.string().min(2),
        body: z.string().min(2),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
      }
      const updated = await updateCommercialScript({ id, ...parsed.data });
      if (!updated) return res.status(404).json({ error: 'Script não encontrado.' });
      res.json({ script: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar script.';
      res.status(500).json({ error: message });
    }
  }
);

app.delete(
  '/api/scripts/:id',
  requireAuth,
  requirePermission('minisite:edit'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const deleted = await deleteCommercialScript(id);
      if (!deleted) return res.status(404).json({ error: 'Script não encontrado.' });
      res.json({ deleted: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao excluir script.';
      res.status(500).json({ error: message });
    }
  }
);

app.post(
  '/api/scripts/restore',
  requireAuth,
  requirePermission('minisite:edit'),
  async (_req: AuthRequest, res) => {
    try {
      const scripts = await restoreDefaultScripts();
      res.json({ scripts });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao restaurar scripts padrão.';
      res.status(500).json({ error: message });
    }
  }
);

// ---- OPERATOR SETTINGS (CONFIG) ----
app.get('/api/settings', optionalAuthOrDemo, async (req: AuthRequest, res) => {
  try {
    const settings = await getOperatorSettings(req.profile?.id ?? null);
    res.json({ settings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar configurações.';
    res.status(500).json({ error: message });
  }
});

app.put('/api/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      operatorName: z.string().max(120).optional(),
      operatorCity: z.string().max(120).optional(),
      sitePriceLabel: z.string().max(60).optional(),
      platePriceLabel: z.string().max(60).optional(),
      baseDomain: z.string().max(120).optional(),
      whatsappConnected: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Configurações inválidas.' });
    }
    const settings = await upsertOperatorSettings(req.profile!.id, parsed.data);
    res.json({ settings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar configurações.';
    res.status(500).json({ error: message });
  }
});

async function handlePublicRootStatus(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
  renderHtml: (url: string) => Promise<string>
) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/demo/')) res.setHeader('X-Robots-Tag', 'noindex');
  const legacyPrefixedSlug = extractLegacyPrefixedSlugFromPath(req.path);
  const candidateSlug = legacyPrefixedSlug || extractPublicMinisiteSlugFromPath(req.path);
  if (!candidateSlug) return next();

  try {
    const lookup = await resolvePublicMinisiteLookup(candidateSlug, false);
    if (lookup.kind === 'redirect') {
      const qs = extractRawQueryString(req.originalUrl);
      const targetPath = `${buildPublicMinisitePath(lookup.targetSlug)}${qs}`;
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.redirect(302, targetPath);
    }
    if (lookup.kind === 'not_found') {
      res.setHeader('X-Robots-Tag', 'noindex');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      if (req.method === 'HEAD') {
        return res.status(404).set({ 'Content-Type': 'text/html; charset=utf-8' }).end();
      }
      const html = await renderHtml(req.originalUrl);
      return res.status(404).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    }
    if (legacyPrefixedSlug) {
      const qs = extractRawQueryString(req.originalUrl);
      const canonicalPath = `${buildPublicMinisitePath(lookup.canonicalSlug)}${qs}`;
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.redirect(302, canonicalPath);
    }
    if (lookup.minisite.mediaValidated !== true) res.setHeader('X-Robots-Tag', 'noindex');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Cache-Control',
        'public, max-age=30, s-maxage=60, stale-while-revalidate=120'
      );
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      await handlePublicRootStatus(req, res, next, async (url) => {
        const rawHtml = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        return await vite.transformIndexHtml(url, rawHtml);
      });
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath));
    app.use(async (req, res, next) => {
      await handlePublicRootStatus(req, res, next, async () =>
        fs.readFileSync(indexHtmlPath, 'utf-8')
      );
    });
    app.get('*', (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Foco Leads 360 running on port ${port}`);
  });
}

startServer();
