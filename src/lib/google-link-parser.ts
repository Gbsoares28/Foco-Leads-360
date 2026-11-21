const ALLOWED_GOOGLE_HOSTS = new Set([
  'share.google',
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'maps.google.com.br',
  'www.google.com',
  'google.com',
  'www.google.com.br',
  'google.com.br',
]);

const REDIRECT_SHORTENER_HOSTS = new Set([
  'share.google',
  'maps.app.goo.gl',
  'goo.gl',
]);

export interface ParsedGoogleLink {
  isUrl: boolean;
  validDomain: boolean;
  originalInput: string;
  resolvedUrl: string | null;
  extractedName: string | null;
  extractedQuery: string | null;
  coordinates: { lat: number; lng: number } | null;
  placeIdHint: string | null;
  kgmid: string | null;
  sourceType: 'share_google' | 'google_maps' | 'text_query';
  notes: string;
}

export function isAllowedGoogleMapsUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_GOOGLE_HOSTS.has(host)) {
      return null;
    }

    if (host.includes('google.')) {
      const path = parsed.pathname.toLowerCase();
      const isMapsPath = path.startsWith('/maps');
      const isSharePath = path.startsWith('/share.google');
      const isSearchPlacePath =
        path.startsWith('/search') &&
        (parsed.searchParams.has('kgmid') || parsed.searchParams.has('ludocid'));
      if (!isMapsPath && !isSharePath && !isSearchPlacePath) {
        return null;
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function safeResolveGoogleMapsLink(rawInput: string): Promise<ParsedGoogleLink> {
  const trimmed = rawInput.trim();
  const looksLikeUrl =
    /^https?:\/\//i.test(trimmed) ||
    /^(share\.google|maps\.app\.goo\.gl|goo\.gl|maps\.google\.)/i.test(trimmed);

  if (!looksLikeUrl) {
    return {
      isUrl: false,
      validDomain: false,
      originalInput: trimmed,
      resolvedUrl: null,
      extractedName: trimmed || null,
      extractedQuery: trimmed || null,
      coordinates: null,
      placeIdHint: null,
      kgmid: null,
      sourceType: 'text_query',
      notes: 'Busca por nome e cidade na Google Places API (New).',
    };
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const initialUrl = isAllowedGoogleMapsUrl(normalizedUrl);

  if (!initialUrl) {
    return {
      isUrl: true,
      validDomain: false,
      originalInput: trimmed,
      resolvedUrl: null,
      extractedName: null,
      extractedQuery: null,
      coordinates: null,
      placeIdHint: null,
      kgmid: null,
      sourceType: 'google_maps',
      notes:
        'Domínio não permitido. Utilize apenas links oficiais do Google (share.google, maps.app.goo.gl ou google.com/maps).',
    };
  }

  const isShareGoogle = initialUrl.hostname.toLowerCase() === 'share.google';
  let currentUrl = initialUrl;

  if (
    REDIRECT_SHORTENER_HOSTS.has(currentUrl.hostname.toLowerCase()) ||
    currentUrl.pathname.startsWith('/share.google')
  ) {
    for (let hop = 0; hop < 5; hop++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(currentUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        const location = response.headers.get('location');
        if (!location) break;

        const absoluteNext = new URL(location, currentUrl.toString()).toString();
        const nextUrl = isAllowedGoogleMapsUrl(absoluteNext);
        if (!nextUrl) break;
        currentUrl = nextUrl;

        const host = currentUrl.hostname.toLowerCase();
        const isFinalSearchOrMaps =
          (host.includes('google.') &&
            (currentUrl.pathname.startsWith('/search') ||
              currentUrl.pathname.startsWith('/maps'))) &&
          !currentUrl.pathname.startsWith('/share.google');

        if (isFinalSearchOrMaps && !REDIRECT_SHORTENER_HOSTS.has(host)) {
          break;
        }
      } catch {
        break;
      }
    }
  }

  const finalStr = currentUrl.toString();
  let extractedName: string | null = null;

  const placeMatch = currentUrl.pathname.match(/\/maps\/place\/([^/]+)/i);
  if (placeMatch && placeMatch[1]) {
    extractedName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
  }

  const qParam = currentUrl.searchParams.get('q') || currentUrl.searchParams.get('query');
  if (!extractedName && qParam && !currentUrl.pathname.startsWith('/share.google')) {
    extractedName = qParam.trim();
  }

  let coordinates: { lat: number; lng: number } | null = null;
  const coordMatch = finalStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch) {
    coordinates = {
      lat: Number(coordMatch[1]),
      lng: Number(coordMatch[2]),
    };
  }

  const placeIdHint = currentUrl.searchParams.get('query_place_id') || null;
  const kgmid = currentUrl.searchParams.get('kgmid') || null;

  return {
    isUrl: true,
    validDomain: true,
    originalInput: trimmed,
    resolvedUrl: finalStr,
    extractedName,
    extractedQuery:
      qParam && !currentUrl.pathname.startsWith('/share.google')
        ? qParam.trim()
        : extractedName,
    coordinates,
    placeIdHint,
    kgmid,
    sourceType: isShareGoogle ? 'share_google' : 'google_maps',
    notes: extractedName
      ? `Link Google validado (${extractedName}).`
      : 'Link Google validado. Confirme ou busque pelo nome da empresa.',
  };
}
