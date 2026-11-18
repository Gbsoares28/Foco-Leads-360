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
  getDashboardData,
  getMinisiteDetail,
  listAuditLogs,
  listBusinesses,
  listMinisites,
  listMinisiteVersions,
  listProfiles,
  restoreMinisiteVersion,
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
import { safeResolveGoogleMapsLink } from './src/lib/google-link-parser.ts';
import {
  getPlaceDetailsById,
  getPlacePhotoMediaUri,
  GoogleMapsQuotaError,
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
} from './src/lib/minisite-types.ts';

dotenv.config();

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
      if (!fs.existsSync(localPath)) return null;
      const ext = path.extname(cleanName).toLowerCase();
      const mimeType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
      if (!mimeType) return null;
      const buf = fs.readFileSync(localPath);
      if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return null;
      return { dataBase64: buf.toString('base64'), mimeType, label };
    }

    if (url.startsWith('/api/google/place-photo')) {
      const parsedQuery = new URL(`http://localhost${url}`);
      const photoName = parsedQuery.searchParams.get('name');
      if (photoName) {
        const mediaUri = await getPlacePhotoMediaUri(photoName, 320);
        if (mediaUri) {
          return await fetchImagePartFromUrl(mediaUri, label);
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
app.use('/uploads', express.static(UPLOADS_DIR));
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
    directionsUri: z.string().optional(),
    reviewsUri: z.string().optional(),
    writeReviewUri: z.string().optional(),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
    reviews: z
      .array(
        z.object({
          authorName: z.string(),
          authorUri: z.string().optional(),
          authorPhotoUri: z.string().optional(),
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
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'foco-leads-360',
    baseDomain: process.env.MINISITE_BASE_DOMAIN || 'focoleads360.com.br',
    placesConfigured: Boolean(
      process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY
    ),
  });
});

// Public Maps JS API key loader (for @vis.gl/react-google-maps <APIProvider>)
app.get('/api/public/maps-config', (_req, res) => {
  res.json({
    apiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
  });
});

// Authenticated media upload (logo, capa, galeria)
app.post(
  '/api/uploads',
  requireAuth,
  requirePermission('minisite:edit'),
  (req: AuthRequest, res) => {
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
      const targetPath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(targetPath, buffer);

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

// Authenticated user profile
app.get('/api/me', requireAuth, (req: AuthRequest, res) => {
  res.json({
    profile: req.profile,
    baseDomain: process.env.MINISITE_BASE_DOMAIN || 'focoleads360.com.br',
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
      baseDomain: process.env.MINISITE_BASE_DOMAIN || 'focoleads360.com.br',
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

    const searchText = parsed.extractedQuery || parsed.extractedName || (!parsed.isUrl ? input : '');

    try {
      if (parsed.placeIdHint) {
        const direct = await getPlaceDetailsById(parsed.placeIdHint);
        if (direct) places = [direct];
      }
      if (places.length === 0 && searchText) {
        places = await searchPlacesByText({
          textQuery: searchText,
          coordinates: parsed.coordinates,
          pageSize: 5,
        });
      }
      if (!process.env.GOOGLE_MAPS_API_KEY && !process.env.VITE_GOOGLE_MAPS_API_KEY) {
        placesWarning =
          'Chave Google Places API não detectada no servidor. Os dados básicos do link foram extraídos para confirmação manual.';
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
      placesWarning =
        err instanceof Error
          ? err.message
          : 'Não foi possível consultar a Google Places API no momento.';
    }

    res.json({ parsed, places, placesWarning });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao analisar o link.';
    res.status(500).json({ error: message });
  }
});

// Proxy authorized Google Place Photo without exposing API key
app.get('/api/google/place-photo', async (req, res) => {
  try {
    const photoName = typeof req.query.name === 'string' ? req.query.name : '';
    const maxWidth = Number(req.query.w || 960);
    if (!photoName || !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
      return res.status(400).json({ error: 'Referência de foto inválida.' });
    }
    const photoUri = await getPlacePhotoMediaUri(photoName, maxWidth);
    if (!photoUri) {
      return res.status(404).json({ error: 'Foto não encontrada.' });
    }
    res.redirect(302, photoUri);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar foto.';
    res.status(500).json({ error: message });
  }
});

// Create minisite from confirmed Google Place / link / description (server-side Gemini)
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
        !payload.confirmedName
      ) {
        return res.status(400).json({
          error: 'Informe o link do Google, nome da empresa ou uma descrição do negócio.',
        });
      }

      const companyTitle =
        payload.confirmedName ||
        payload.queryOrUrl ||
        payload.description.split('\n')[0].slice(0, 60) ||
        'Nova Empresa';

      const rawPhotos = payload.googlePlaceData?.photos || [];
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
          const candidatePhotoNames = [
            firstPhotoName,
            rawPhotos[1]?.photoName || '',
          ].filter(Boolean);

          for (const pName of candidatePhotoNames.slice(0, 2)) {
            const mediaUri = await getPlacePhotoMediaUri(pName, 480).catch(() => null);
            if (mediaUri) {
              const part = await fetchImagePartFromUrl(mediaUri, 'fachada');
              if (part) imageParts.push(part);
            }
          }

          aiStructured = await structureMinisiteWithGemini({
            companyNameOrQuery: companyTitle,
            category: payload.confirmedCategory,
            types: payload.googlePlaceData?.types,
            city: payload.confirmedCity,
            address: payload.confirmedAddress,
            phone: payload.confirmedPhone || payload.confirmedWhatsapp,
            website: payload.confirmedWebsite,
            googleDescription: payload.googlePlaceData?.description,
            weekdayDescriptions: payload.googlePlaceData?.weekdayDescriptions,
            rating: payload.googlePlaceData?.rating,
            userRatingCount: payload.googlePlaceData?.userRatingCount,
            reviewsSample: payload.googlePlaceData?.reviews?.slice(0, 3).map((r) => r.text),
            description: payload.description,
            resolvedMapsUrl: payload.resolvedMapsUrl || null,
            imageParts,
          });
        } catch (err) {
          aiErrorNote = formatGeminiError(err).message;
        }
      }

      let targetBusinessId = payload.businessId;
      if (!targetBusinessId) {
        const createdBiz = await createBusinessRecord({
          name: payload.confirmedName || aiStructured?.business.name || companyTitle,
          category:
            payload.confirmedCategory || aiStructured?.business.category || 'Negócio local',
          city: payload.confirmedCity || aiStructured?.business.city || '',
          neighborhood: payload.confirmedNeighborhood || '',
          state: payload.confirmedState || '',
          address: payload.confirmedAddress || aiStructured?.business.address || '',
          phone: payload.confirmedPhone || aiStructured?.business.phone || '',
          whatsapp: payload.confirmedWhatsapp || aiStructured?.business.whatsapp || '',
          website: payload.confirmedWebsite || '',
          instagram: payload.confirmedInstagram || aiStructured?.business.instagram || '',
          googlePlaceId: payload.googlePlaceId || undefined,
          googleMapsUrl: payload.resolvedMapsUrl || '',
          sourceMetadata: {
            origin: payload.googlePlaceId
              ? 'google_places_api_new'
              : aiStructured
                ? 'gemini_structured'
                : 'manual',
            googleDescription: payload.googlePlaceData?.description || '',
            rating: payload.googlePlaceData?.rating ?? null,
            userRatingCount: payload.googlePlaceData?.userRatingCount ?? null,
            needsReviewFields: aiStructured?.needsReviewFields ?? [],
          },
          isDemo: payload.isDemo,
          actorId: req.profile?.id ?? null,
        });
        targetBusinessId = createdBiz.id;
      }

      const finalName = payload.confirmedName || aiStructured?.business.name || companyTitle;
      const finalCategory =
        payload.confirmedCategory || aiStructured?.business.category || 'Empresa local';
      const fallbackDesc =
        payload.googlePlaceData?.description ||
        payload.description ||
        `${finalCategory}${payload.confirmedCity ? ` em ${payload.confirmedCity}` : ''}`;

      const heroTitle = aiStructured?.hero.title || finalName;
      const heroSubtitle = (aiStructured?.hero.subtitle || fallbackDesc).slice(0, 180);

      const finalPhone = payload.confirmedPhone || aiStructured?.business.phone || '';
      const finalWhatsapp =
        payload.confirmedWhatsapp || aiStructured?.business.whatsapp || '';
      const finalAddress =
        payload.confirmedAddress || aiStructured?.business.address || '';
      const finalInstagram =
        payload.confirmedInstagram || aiStructured?.business.instagram || '';

      const firstPhotoAttr =
        rawPhotos[0]?.authorAttributions?.[0] ||
        payload.googlePlaceData?.firstPhotoAttribution ||
        null;

      const coverImageProxy = firstPhotoName
        ? `/api/google/place-photo?name=${encodeURIComponent(firstPhotoName)}&w=1080`
        : '';

      const galleryImages = rawPhotos.slice(0, 6).map((p) => ({
        url: `/api/google/place-photo?name=${encodeURIComponent(p.photoName)}&w=960`,
        caption: '',
        attributionName: p.authorAttributions?.[0]?.displayName || 'Google Maps',
        attributionUri: p.authorAttributions?.[0]?.uri || '',
      }));

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
        logoImage: '',
        fixedWhatsappButton: Boolean(finalWhatsapp || finalPhone),
        showOpenBadge: payload.googlePlaceData?.openNow != null,
        openBadgeText:
          payload.googlePlaceData?.openNow === true
            ? 'Aberto agora'
            : payload.googlePlaceData?.openNow === false
              ? 'Fechado no momento'
              : '',
        photoAttribution: firstPhotoAttr,
      };

      const blocks: Array<{
        blockType: string;
        visible: boolean;
        content: Record<string, unknown>;
      }> = [
        {
          blockType: 'capa',
          visible: true,
          content: {
            title: heroTitle,
            subtitle: heroSubtitle,
            image: coverImageProxy,
            photoAttribution: firstPhotoAttr,
          },
        },
      ];

      if (finalInstagram) {
        const rawIg = finalInstagram.replace(/^@/, '');
        blocks.push({
          blockType: 'botao_instagram',
          visible: true,
          content: {
            label: 'Instagram',
            url: finalInstagram.startsWith('http')
              ? finalInstagram
              : `https://instagram.com/${rawIg}`,
          },
        });
      } else if (payload.confirmedWebsite) {
        blocks.push({
          blockType: 'botao_link',
          visible: true,
          content: {
            label: 'Visitar site oficial',
            url: payload.confirmedWebsite,
            icon: 'globe',
            style: 'primary',
          },
        });
      }

      blocks.push({
        blockType: 'whatsapp',
        visible: Boolean(finalWhatsapp || finalPhone),
        content: {
          phone: finalWhatsapp || finalPhone.replace(/\D/g, ''),
          label: aiStructured?.ctaLabel || 'WhatsApp',
          message: `Olá! Gostaria de falar com ${finalName}.`,
          needsReview: !finalWhatsapp,
        },
      });

      if (payload.googlePlaceData?.reviewsUri || payload.googlePlaceData?.rating != null) {
        blocks.push({
          blockType: 'avaliacoes_google',
          visible: true,
          content: {
            rating: payload.googlePlaceData?.rating ?? null,
            userRatingCount: payload.googlePlaceData?.userRatingCount ?? null,
            reviewsUri:
              payload.googlePlaceData?.writeReviewUri ||
              payload.googlePlaceData?.reviewsUri ||
              payload.resolvedMapsUrl ||
              '',
            writeReviewUri: payload.googlePlaceData?.writeReviewUri || '',
            label: 'Nos avalie no Google',
            attribution: 'Google Maps',
          },
        });
      }

      if (finalAddress || payload.resolvedMapsUrl || payload.googlePlaceData?.directionsUri) {
        blocks.push({
          blockType: 'como_chegar',
          visible: true,
          content: {
            address: finalAddress,
            directionsUri:
              payload.googlePlaceData?.directionsUri || payload.resolvedMapsUrl || '',
            label: 'Como chegar',
          },
        });
      }

      if (aiStructured?.services && aiStructured.services.length > 0) {
        blocks.push({
          blockType: 'titulo_secao',
          visible: true,
          content: {
            title: aiStructured.sectionTitle || 'O que oferecemos',
            subtitle: '',
          },
        });

        for (const svc of aiStructured.services) {
          blocks.push({
            blockType: 'produto_servico',
            visible: true,
            content: {
              name: svc.name,
              description: svc.description || '',
              price: '',
              image: '',
              needsReview: Boolean(svc.needsReview),
            },
          });
        }
      }

      const bodyText =
        aiStructured?.institutionalText ||
        payload.googlePlaceData?.description ||
        payload.description;

      if (bodyText && bodyText.trim()) {
        blocks.push({
          blockType: 'texto',
          visible: true,
          content: {
            title: 'Sobre nós',
            body: bodyText.trim(),
          },
        });
      }

      if (
        (payload.googlePlaceData?.reviews && payload.googlePlaceData.reviews.length > 0) ||
        payload.googlePlaceData?.rating != null
      ) {
        blocks.push({
          blockType: 'avaliacoes',
          visible: true,
          content: {
            title: 'Quem visita recomenda',
            rating: payload.googlePlaceData?.rating ?? null,
            userRatingCount: payload.googlePlaceData?.userRatingCount ?? null,
            reviewsUri: payload.googlePlaceData?.reviewsUri || payload.resolvedMapsUrl || '',
            reviews: payload.googlePlaceData?.reviews || [],
          },
        });
      }

      if (galleryImages.length > 0) {
        blocks.push({
          blockType: 'galeria',
          visible: true,
          content: {
            title: 'Fotos do estabelecimento',
            images: galleryImages,
          },
        });
      }

      if (payload.googlePlaceData?.weekdayDescriptions?.length) {
        blocks.push({
          blockType: 'horarios',
          visible: true,
          content: {
            title: 'Horário de funcionamento',
            openNow: payload.googlePlaceData?.openNow ?? null,
            weekdayDescriptions: payload.googlePlaceData.weekdayDescriptions,
          },
        });
      }

      if (finalAddress || payload.googlePlaceData?.location) {
        blocks.push({
          blockType: 'endereco_mapa',
          visible: true,
          content: {
            title: 'Onde estamos',
            address: finalAddress,
            phone: finalPhone,
            website: payload.confirmedWebsite || '',
            mapsUrl: payload.resolvedMapsUrl || '',
            directionsUri:
              payload.googlePlaceData?.directionsUri || payload.resolvedMapsUrl || '',
            location: payload.googlePlaceData?.location || null,
            showMap: true,
          },
        });
      }

      blocks.push({
        blockType: 'redes_sociais',
        visible: Boolean(finalInstagram || payload.confirmedWebsite),
        content: {
          title: 'Linha de ícones das suas redes',
          instagram: finalInstagram,
          facebook: '',
          youtube: '',
          tiktok: '',
          website: payload.confirmedWebsite || '',
        },
      });

      const minisite = await createMinisiteRecord({
        businessId: targetBusinessId,
        title: finalName,
        status: payload.isDemo ? 'demonstracao' : 'rascunho',
        templateId,
        theme: themePayload,
        seo: {
          title: aiStructured?.seo?.title || `${finalName} | Demonstração`,
          description: aiStructured?.seo?.description || heroSubtitle,
          noIndex: true,
        },
        blocks,
        isDemo: payload.isDemo,
        actorId: req.profile?.id ?? null,
      });

      res.status(201).json({
        minisite,
        aiUsed: Boolean(aiStructured),
        aiNote: aiErrorNote,
      });
    } catch (error: unknown) {
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
            'A publicação oficial em subdomínio exige autorização explícita de um Administrador.',
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

      res.json({ minisite: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar status.';
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
    res.json({ minisite: detail });
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

      res.json({ minisite: updated });
    } catch (error: unknown) {
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

// Public / Demo preview endpoint by slug
app.get('/api/public/minisite/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const detail = await getMinisiteDetail({ slug, incrementViews: true });
    if (!detail || detail.status === 'desativado') {
      return res.status(404).json({ error: 'Minisite não encontrado ou desativado.' });
    }
    res.json({
      minisite: detail,
      baseDomain: process.env.MINISITE_BASE_DOMAIN || 'focoleads360.com.br',
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

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Foco Leads 360 running on port ${port}`);
  });
}

startServer();
