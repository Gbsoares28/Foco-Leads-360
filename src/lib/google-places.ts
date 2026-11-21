import type { GoogleReviewItem } from './minisite-types.ts';

export class GoogleMapsQuotaError extends Error {
  status = 429;
  code = 'GMP_QUOTA_EXCEEDED';
  constructor(message: string) {
    super(message);
  }
}

export class GooglePlacesApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 502, code = 'GMP_API_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface GooglePlacePhotoCandidate {
  photoName: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions: Array<{
    displayName: string;
    uri?: string;
    photoUri?: string;
  }>;
}

export interface GooglePlaceCandidate {
  placeId: string;
  name: string;
  category: string;
  primaryType: string;
  types: string[];
  description: string;
  formattedAddress: string;
  shortAddress: string;
  city: string;
  neighborhood: string;
  state: string;
  phone: string;
  internationalPhone: string;
  whatsappCandidate: string;
  website: string;
  googleMapsUri: string;
  directionsUri: string;
  reviewsUri: string;
  writeReviewUri: string;
  photosUri: string;
  placeUri: string;
  rating: number | null;
  userRatingCount: number | null;
  reviews: GoogleReviewItem[];
  weekdayDescriptions: string[];
  openNow: boolean | null;
  businessStatus: string;
  location: { lat: number; lng: number } | null;
  photos: GooglePlacePhotoCandidate[];
}

const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.addressComponents',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.editorialSummary',
  'places.generativeSummary',
  'places.googleMapsUri',
  'places.googleMapsLinks',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours',
  'places.currentOpeningHours',
  'places.rating',
  'places.userRatingCount',
  'places.reviews',
  'places.businessStatus',
  'places.photos',
].join(',');

const PLACE_DETAILS_FIELD_MASK = PLACES_FIELD_MASK.replace(/places\./g, '');

const PLACE_CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHED_PLACES = 60;
const transientPlaceCache = new Map<string, { place: GooglePlaceCandidate; expiresAt: number }>();

export function cacheGooglePlaceCandidate(place: GooglePlaceCandidate) {
  const cleanId = String(place.placeId || '').replace(/^places\//, '').trim();
  if (!cleanId) return;
  if (transientPlaceCache.has(cleanId)) {
    transientPlaceCache.delete(cleanId);
  }
  while (transientPlaceCache.size >= MAX_CACHED_PLACES) {
    const oldest = transientPlaceCache.keys().next().value;
    if (!oldest) break;
    transientPlaceCache.delete(oldest);
  }
  transientPlaceCache.set(cleanId, {
    place,
    expiresAt: Date.now() + PLACE_CACHE_TTL_MS,
  });
}

export function clearGooglePlaceCache(placeId?: string) {
  if (placeId) {
    const cleanId = String(placeId).replace(/^places\//, '').trim();
    transientPlaceCache.delete(cleanId);
    return;
  }
  transientPlaceCache.clear();
}

function getGoogleMapsApiKey(): string | null {
  const raw =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'MY_GOOGLE_MAPS_API_KEY') {
    return null;
  }
  return trimmed;
}

function normalizeGoogleUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  const trimmed = uri.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
}

function formatPlacesHttpError(
  status: number,
  json: Record<string, unknown>,
  rawText?: string
): GooglePlacesApiError {
  const errObj = json.error as { message?: string; status?: string } | undefined;
  const apiStatus = errObj?.status || '';
  const apiMessage = errObj?.message || rawText || `HTTP ${status}`;

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    console.error('[GooglePlaces 429/RESOURCE_EXHAUSTED]:', apiMessage);
    throw new GoogleMapsQuotaError(
      apiMessage && apiMessage !== 'HTTP 429'
        ? `Cota da Google Places API atingida no momento (${apiMessage}).`
        : 'Cota da Google Places API atingida no momento.'
    );
  }

  if (status === 401 || status === 403 || apiStatus === 'PERMISSION_DENIED' || apiStatus === 'UNAUTHENTICATED') {
    return new GooglePlacesApiError(
      `Falha de permissão/chave na Google Places API (New): ${apiMessage}`,
      status,
      apiStatus || 'GMP_PERMISSION_DENIED'
    );
  }

  if (status === 400 || status === 404 || apiStatus === 'INVALID_ARGUMENT' || apiStatus === 'NOT_FOUND') {
    return new GooglePlacesApiError(
      `Place ID ou parâmetro inválido na Google Places API: ${apiMessage}`,
      status,
      apiStatus || 'GMP_INVALID_REQUEST'
    );
  }

  return new GooglePlacesApiError(
    `Erro na Google Places API (${status}): ${apiMessage}`,
    status >= 400 ? status : 502,
    apiStatus || 'GMP_API_ERROR'
  );
}

function extractBrazilianMobileWhatsapp(internationalPhone?: string): string {
  if (!internationalPhone) return '';
  const digits = internationalPhone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    return digits;
  }
  return '';
}

export function mapRawPlace(place: Record<string, unknown>): GooglePlaceCandidate {
  const displayName = place.displayName as { text?: string } | undefined;
  const primaryTypeDisplay = place.primaryTypeDisplayName as { text?: string } | undefined;
  const editorialSummary = place.editorialSummary as { text?: string } | undefined;
  const generativeSummary = place.generativeSummary as
    | { overview?: { text?: string }; description?: { text?: string } }
    | undefined;
  const googleMapsLinks = place.googleMapsLinks as
    | {
        directionsUri?: string;
        reviewsUri?: string;
        writeAReviewUri?: string;
        photosUri?: string;
        placeUri?: string;
      }
    | undefined;
  const regularHours = place.regularOpeningHours as
    | { weekdayDescriptions?: string[]; openNow?: boolean }
    | undefined;
  const currentHours = place.currentOpeningHours as
    | { weekdayDescriptions?: string[]; openNow?: boolean }
    | undefined;
  const locationObj = place.location as { latitude?: number; longitude?: number } | undefined;
  const addressComponents = Array.isArray(place.addressComponents)
    ? (place.addressComponents as Array<{
        longText?: string;
        shortText?: string;
        types?: string[];
      }>)
    : [];

  const getComp = (typeName: string, short = false) => {
    const found = addressComponents.find((c) => c.types?.includes(typeName));
    return (short ? found?.shortText : found?.longText) || '';
  };

  const city =
    getComp('administrative_area_level_2') || getComp('locality') || '';
  const neighborhood =
    getComp('sublocality_level_1') || getComp('sublocality') || '';
  const state = getComp('administrative_area_level_1', true) || '';

  const rawPhotos = Array.isArray(place.photos)
    ? (place.photos as Array<Record<string, unknown>>)
    : [];

  const photos: GooglePlacePhotoCandidate[] = rawPhotos.slice(0, 10).map((ph) => {
    const attrs = Array.isArray(ph.authorAttributions)
      ? (ph.authorAttributions as Array<{ displayName?: string; uri?: string; photoUri?: string }>).map(
          (a) => ({
            displayName: a.displayName || 'Google Maps',
            uri: normalizeGoogleUri(a.uri),
            photoUri: normalizeGoogleUri(a.photoUri),
          })
        )
      : [];
    return {
      photoName: String(ph.name || ''),
      widthPx: typeof ph.widthPx === 'number' ? ph.widthPx : undefined,
      heightPx: typeof ph.heightPx === 'number' ? ph.heightPx : undefined,
      authorAttributions: attrs,
    };
  });

  const rawReviews = Array.isArray(place.reviews)
    ? (place.reviews as Array<Record<string, unknown>>)
    : [];

  const reviews: GoogleReviewItem[] = rawReviews
    .slice(0, 5)
    .map((rev) => {
      const author = rev.authorAttribution as
        | { displayName?: string; uri?: string; photoUri?: string }
        | undefined;
      const textObj = (rev.text || rev.originalText) as { text?: string } | undefined;
      return {
        authorName: author?.displayName || 'Cliente no Google',
        authorUri: normalizeGoogleUri(author?.uri),
        authorPhotoUri: normalizeGoogleUri(author?.photoUri),
        reviewUri: normalizeGoogleUri(
          typeof rev.googleMapsUri === 'string' ? rev.googleMapsUri : undefined
        ),
        rating: typeof rev.rating === 'number' ? rev.rating : 5,
        relativeTime: String(rev.relativePublishTimeDescription || ''),
        text: textObj?.text?.trim() || '',
      };
    })
    .filter((r) => r.text.length > 0 || r.rating > 0);

  const intlPhone = String(place.internationalPhoneNumber || '');
  const description =
    editorialSummary?.text?.trim() ||
    generativeSummary?.overview?.text?.trim() ||
    generativeSummary?.description?.text?.trim() ||
    '';

  const weekdayDescriptions =
    Array.isArray(regularHours?.weekdayDescriptions) && regularHours!.weekdayDescriptions!.length > 0
      ? regularHours!.weekdayDescriptions!
      : Array.isArray(currentHours?.weekdayDescriptions)
        ? currentHours!.weekdayDescriptions!
        : [];

  const openNow =
    typeof currentHours?.openNow === 'boolean'
      ? currentHours.openNow
      : typeof regularHours?.openNow === 'boolean'
        ? regularHours.openNow
        : null;

  const googleMapsUri = String(place.googleMapsUri || googleMapsLinks?.placeUri || '');

  return {
    placeId: String(place.id || ''),
    name: displayName?.text || '',
    category: primaryTypeDisplay?.text || String(place.primaryType || 'Empresa local'),
    primaryType: String(place.primaryType || ''),
    types: Array.isArray(place.types) ? place.types.map(String) : [],
    description,
    formattedAddress: String(place.formattedAddress || ''),
    shortAddress: String(place.shortFormattedAddress || ''),
    city,
    neighborhood,
    state,
    phone: String(place.nationalPhoneNumber || ''),
    internationalPhone: intlPhone,
    whatsappCandidate: extractBrazilianMobileWhatsapp(intlPhone),
    website: String(place.websiteUri || ''),
    googleMapsUri,
    directionsUri: googleMapsLinks?.directionsUri || '',
    reviewsUri: googleMapsLinks?.reviewsUri || '',
    writeReviewUri: googleMapsLinks?.writeAReviewUri || '',
    photosUri: googleMapsLinks?.photosUri || googleMapsUri,
    placeUri: googleMapsLinks?.placeUri || googleMapsUri,
    rating: typeof place.rating === 'number' ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    reviews,
    weekdayDescriptions,
    openNow,
    businessStatus: String(place.businessStatus || ''),
    location:
      typeof locationObj?.latitude === 'number' && typeof locationObj?.longitude === 'number'
        ? { lat: locationObj.latitude, lng: locationObj.longitude }
        : null,
    photos: photos.filter((p) => p.photoName),
  };
}

export async function searchPlacesByText(params: {
  textQuery: string;
  coordinates?: { lat: number; lng: number } | null;
  pageSize?: number;
  regionCode?: string;
}): Promise<GooglePlaceCandidate[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new GooglePlacesApiError(
      'Chave GOOGLE_MAPS_API_KEY não configurada no servidor.',
      503,
      'GMP_KEY_MISSING'
    );
  }

  const body: Record<string, unknown> = {
    textQuery: params.textQuery,
    languageCode: 'pt-BR',
    regionCode: params.regionCode || 'BR',
    pageSize: Math.min(20, Math.max(1, params.pageSize ?? 5)),
  };

  if (params.coordinates) {
    body.locationBias = {
      circle: {
        center: {
          latitude: params.coordinates.lat,
          longitude: params.coordinates.lng,
        },
        radius: 1500.0,
      },
    };
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
      'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    throw formatPlacesHttpError(response.status, json, rawText);
  }

  const places = Array.isArray(json.places)
    ? (json.places as Array<Record<string, unknown>>)
    : [];

  const mapped = places.map(mapRawPlace);
  for (const item of mapped) {
    cacheGooglePlaceCandidate(item);
  }
  return mapped;
}

export interface ProspectingLeadResult extends GooglePlaceCandidate {
  leadScore: number;
  hasWebsite: boolean;
  competitorName: string;
  competitorReviews: number;
  gapReviews: number;
  opportunityReasons: string[];
}

export async function searchPlacesProspecting(params: {
  country: string;
  state: string;
  city: string;
  niche: string;
  neighborhoods: string[];
}): Promise<{
  results: ProspectingLeadResult[];
  requestsUsed: number;
  topCompetitor: { name: string; reviews: number; rating: number | null } | null;
}> {
  const neighborhoods = params.neighborhoods.filter((n) => n.trim().length > 0).slice(0, 3);
  const queries =
    neighborhoods.length > 0
      ? neighborhoods.map((b) =>
          [params.niche, b.trim(), params.city, params.state].filter(Boolean).join(', ')
        )
      : [[params.niche, params.city, params.state].filter(Boolean).join(', ')];

  const dedupedByPlaceId: Record<string, GooglePlaceCandidate> = {};
  let requestsUsed = 0;

  for (const textQuery of queries) {
    requestsUsed += 1;
    const batch = await searchPlacesByText({
      textQuery,
      pageSize: 20,
      regionCode: params.country || 'BR',
    });
    for (const p of batch) {
      if (p.placeId && !dedupedByPlaceId[p.placeId]) {
        dedupedByPlaceId[p.placeId] = p;
      }
    }
  }

  const allPlaces = Object.values(dedupedByPlaceId);
  if (allPlaces.length === 0) {
    return { results: [], requestsUsed, topCompetitor: null };
  }

  const sortedByReviews = [...allPlaces].sort(
    (a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0)
  );
  const leader = sortedByReviews[0];
  const topCompetitor = leader
    ? {
        name: leader.name,
        reviews: leader.userRatingCount ?? 0,
        rating: leader.rating,
      }
    : null;

  const scored: ProspectingLeadResult[] = allPlaces.map((place) => {
    const hasWebsite = Boolean(place.website && place.website.trim().length > 0);
    const reviewsCount = place.userRatingCount ?? 0;
    const leaderReviews = leader?.userRatingCount ?? 0;
    const gapReviews = Math.max(0, leaderReviews - reviewsCount);

    let score = 0;
    const reasons: string[] = [];

    if (!hasWebsite) {
      score += 45;
      reasons.push('Sem site próprio cadastrado');
    } else {
      score += 10;
    }

    if (gapReviews > 0) {
      const gapBonus = Math.min(25, Math.round((gapReviews / Math.max(1, leaderReviews)) * 25));
      score += gapBonus;
      reasons.push(`${gapReviews} avaliações atrás do líder local`);
    }

    if ((place.rating ?? 0) >= 4.2 && reviewsCount >= 10) {
      score += 15;
      reasons.push(`Boa reputação (${place.rating?.toFixed(1)}★)`);
    }

    if (place.whatsappCandidate || place.phone) {
      score += 10;
      reasons.push(place.whatsappCandidate ? 'WhatsApp identificado' : 'Telefone disponível');
    }

    if (place.photos.length > 0) {
      score += 5;
    }

    return {
      ...place,
      leadScore: Math.min(100, score),
      hasWebsite,
      competitorName: leader?.name || '',
      competitorReviews: leaderReviews,
      gapReviews,
      opportunityReasons: reasons,
    };
  });

  scored.sort((a, b) => b.leadScore - a.leadScore);

  return { results: scored, requestsUsed, topCompetitor };
}

const PLACE_PHOTOS_ONLY_FIELD_MASK = [
  'id',
  'googleMapsUri',
  'googleMapsLinks.photosUri',
  'photos',
].join(',');

export async function getPlaceDetailsById(
  placeId: string,
  options?: { photosOnly?: boolean; forceRefresh?: boolean }
): Promise<GooglePlaceCandidate> {
  const cleanId = String(placeId || '').replace(/^places\//, '').trim();
  if (!cleanId) {
    throw new GooglePlacesApiError('Place ID ausente ou inválido.', 400, 'GMP_INVALID_PLACE_ID');
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new GooglePlacesApiError(
      'Chave GOOGLE_MAPS_API_KEY não configurada no servidor.',
      503,
      'GMP_KEY_MISSING'
    );
  }

  if (!options?.photosOnly && !options?.forceRefresh) {
    const cached = transientPlaceCache.get(cleanId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.place;
    }
    if (cached) {
      transientPlaceCache.delete(cleanId);
    }
  }

  const fieldMask = options?.photosOnly ? PLACE_PHOTOS_ONLY_FIELD_MASK : PLACE_DETAILS_FIELD_MASK;

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(cleanId)}?languageCode=pt-BR&regionCode=BR`,
    {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
    }
  );

  const rawText = await response.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    throw formatPlacesHttpError(response.status, json, rawText);
  }

  const mapped = mapRawPlace(json);
  if (!options?.photosOnly) {
    cacheGooglePlaceCandidate(mapped);
  }
  return mapped;
}

export async function getPlacePhotoMediaUri(
  photoName: string,
  maxWidthPx = 960
): Promise<string> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new GooglePlacesApiError(
      'Chave GOOGLE_MAPS_API_KEY não configurada no servidor.',
      503,
      'GMP_KEY_MISSING'
    );
  }
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
    throw new GooglePlacesApiError('Referência de foto Google inválida.', 400, 'GMP_INVALID_PHOTO_REF');
  }

  const clampedWidth = Math.min(1600, Math.max(200, Math.round(maxWidthPx || 960)));
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${clampedWidth}&skipHttpRedirect=true`;

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(6000),
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
    },
  });

  const rawText = await response.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    throw formatPlacesHttpError(response.status, json, rawText);
  }

  const photoUri = typeof json.photoUri === 'string' ? json.photoUri : '';
  if (!photoUri) {
    throw new GooglePlacesApiError('A Google Places API não retornou URL para esta foto.', 404, 'GMP_PHOTO_EMPTY');
  }
  return photoUri;
}
