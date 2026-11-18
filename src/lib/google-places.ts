import type { GoogleReviewItem } from './minisite-types.ts';

export class GoogleMapsQuotaError extends Error {
  status = 429;
  code = 'GMP_QUOTA_EXCEEDED';
  constructor(message: string) {
    super(message);
  }
}

export interface GooglePlacePhotoCandidate {
  photoName: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions: Array<{
    displayName: string;
    uri?: string;
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

function getGoogleMapsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    null
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

function mapRawPlace(place: Record<string, unknown>): GooglePlaceCandidate {
  const displayName = place.displayName as { text?: string } | undefined;
  const primaryTypeDisplay = place.primaryTypeDisplayName as { text?: string } | undefined;
  const editorialSummary = place.editorialSummary as { text?: string } | undefined;
  const generativeSummary = place.generativeSummary as
    | { overview?: { text?: string }; description?: { text?: string } }
    | undefined;
  const googleMapsLinks = place.googleMapsLinks as
    | { directionsUri?: string; reviewsUri?: string; writeAReviewUri?: string }
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

  const photos: GooglePlacePhotoCandidate[] = rawPhotos.slice(0, 8).map((ph) => {
    const attrs = Array.isArray(ph.authorAttributions)
      ? (ph.authorAttributions as Array<{ displayName?: string; uri?: string }>).map((a) => ({
          displayName: a.displayName || 'Google Maps',
          uri: a.uri ? (a.uri.startsWith('//') ? `https:${a.uri}` : a.uri) : undefined,
        }))
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
        authorUri: author?.uri,
        authorPhotoUri: author?.photoUri,
        rating: typeof rev.rating === 'number' ? rev.rating : 5,
        relativeTime: String(rev.relativePublishTimeDescription || ''),
        text: textObj?.text?.trim() || '',
      };
    })
    .filter((r) => r.text.length > 0);

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
    googleMapsUri: String(place.googleMapsUri || ''),
    directionsUri: googleMapsLinks?.directionsUri || '',
    reviewsUri: googleMapsLinks?.reviewsUri || '',
    writeReviewUri: googleMapsLinks?.writeAReviewUri || '',
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
    return [];
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
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
      'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (response.status === 429 || (json.error as { status?: string } | undefined)?.status === 'RESOURCE_EXHAUSTED') {
    throw new GoogleMapsQuotaError('Cota da Google Places API atingida no momento.');
  }

  if (!response.ok) {
    const errMsg =
      (json.error as { message?: string } | undefined)?.message ||
      `Erro na Google Places API (${response.status})`;
    throw new Error(errMsg);
  }

  const places = Array.isArray(json.places)
    ? (json.places as Array<Record<string, unknown>>)
    : [];

  return places.map(mapRawPlace);
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

export async function getPlaceDetailsById(placeId: string): Promise<GooglePlaceCandidate | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || !placeId) return null;

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
    }
  );

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (response.status === 429 || (json.error as { status?: string } | undefined)?.status === 'RESOURCE_EXHAUSTED') {
    throw new GoogleMapsQuotaError('Cota da Google Places API atingida no momento.');
  }

  if (!response.ok) {
    return null;
  }

  return mapRawPlace(json);
}

export async function getPlacePhotoMediaUri(
  photoName: string,
  maxWidthPx = 960
): Promise<string | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
    return null;
  }

  const clampedWidth = Math.min(1600, Math.max(200, maxWidthPx));
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${clampedWidth}&skipHttpRedirect=true`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
    },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json().catch(() => ({}))) as { photoUri?: string };
  return json.photoUri || null;
}
