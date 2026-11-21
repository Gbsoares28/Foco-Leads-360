import type { GooglePlaceCandidate } from './google-places.ts';
import type {
  GalleryPhotoItem,
  GoogleReviewItem,
  MinisiteBlockData,
  MinisiteTheme,
} from './minisite-types.ts';

export function isGooglePlacePhotoUrl(url?: string | null): boolean {
  return Boolean(url && url.includes('/api/google/place-photo'));
}

const PT_LOWER_CONNECTORS = new Set([
  'a',
  'as',
  'o',
  'os',
  'e',
  'da',
  'das',
  'do',
  'dos',
  'de',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'para',
  'por',
  'com',
]);

function toTitleCasePtBr(input: string): string {
  const words = input.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && PT_LOWER_CONNECTORS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Extracts a concise, natural brand name when Google Places titles combine SEO descriptors
 * and brand name (e.g. "PET SHOP BANHO E TOSA NA TIJUCA – NOSSO PET FAVORITO" -> "Nosso Pet Favorito").
 */
export function extractCleanBrandTitle(rawName: string): string {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';

  // If title has separator like " – ", " - ", or " | ", prefer the shorter brand segment when the other looks like SEO keywords
  const segments = trimmed
    .split(/\s+[–—|\-]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let chosen = trimmed;
  if (segments.length >= 2) {
    const keywordPattern =
      /\b(pet\s*shop|banho\s*e\s*tosa|cl[ií]nica|veterin[aá]ri[oa]|barbearia|sal[aã]o|restaurante|pizzaria|loja|tijuca|centro|zona\s+sul|barra|copacabana|ipanema|botafogo)\b/i;
    const brandCandidates = segments.filter((seg) => !keywordPattern.test(seg));
    if (brandCandidates.length === 1 && brandCandidates[0].length >= 3) {
      chosen = brandCandidates[0];
    } else if (segments[0].length > 26 && segments[segments.length - 1].length <= 28) {
      chosen = segments[segments.length - 1];
    }
  }

  // Convert ALL-CAPS shouting titles to readable Title Case
  const letters = chosen.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const isAllCaps = letters.length >= 4 && letters === letters.toUpperCase();
  if (isAllCaps) {
    return toTitleCasePtBr(chosen);
  }

  return chosen;
}

function formatHourPiece(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return raw.trim();
  const h = Number(m[1]);
  const min = m[2];
  return min === '00' ? `${h}h` : `${h}h${min}`;
}

export function formatCompactPtBrHours(rawHours: string): string {
  const trimmed = String(rawHours || '').trim();
  if (!trimmed) return '';
  if (/fechado/i.test(trimmed)) return 'Fechado';
  if (/24\s*horas/i.test(trimmed)) return 'Aberto 24h';

  const rangeMatch = trimmed.match(/(\d{1,2}:\d{2})\s*[–—\-àa]+\s*(\d{1,2}:\d{2})/i);
  if (rangeMatch) {
    return `${formatHourPiece(rangeMatch[1])} às ${formatHourPiece(rangeMatch[2])}`;
  }
  return trimmed;
}

const WEEKDAY_ORDER_INFO: Array<{
  dayIndex: number;
  matchPrefix: string;
  shortLabel: string;
}> = [
  { dayIndex: 1, matchPrefix: 'segunda', shortLabel: 'Segunda' },
  { dayIndex: 2, matchPrefix: 'terça', shortLabel: 'Terça' },
  { dayIndex: 3, matchPrefix: 'quarta', shortLabel: 'Quarta' },
  { dayIndex: 4, matchPrefix: 'quinta', shortLabel: 'Quinta' },
  { dayIndex: 5, matchPrefix: 'sexta', shortLabel: 'Sexta' },
  { dayIndex: 6, matchPrefix: 'sábado', shortLabel: 'Sábado' },
  { dayIndex: 0, matchPrefix: 'domingo', shortLabel: 'Domingo' },
];

/**
 * Formats live badge text including today's closing time when available
 * (e.g. "Aberto agora · até 17h").
 */
export function formatOpenBadgeText(
  openNow?: boolean | null,
  weekdayDescriptions?: string[],
  now: Date = new Date()
): string {
  if (openNow == null) return '';
  if (!openNow) return 'Fechado no momento';

  const todayInfo = WEEKDAY_ORDER_INFO.find((d) => d.dayIndex === now.getDay());
  if (todayInfo && Array.isArray(weekdayDescriptions) && weekdayDescriptions.length > 0) {
    const todayLine = weekdayDescriptions.find((line) =>
      line.toLowerCase().trim().startsWith(todayInfo.matchPrefix)
    );
    if (todayLine) {
      const colonIdx = todayLine.indexOf(':');
      const hoursPart = colonIdx >= 0 ? todayLine.slice(colonIdx + 1) : todayLine;
      const matches = [...hoursPart.matchAll(/(\d{1,2}:\d{2})/g)];
      if (matches.length >= 2) {
        const closeTime = formatHourPiece(matches[matches.length - 1][1]);
        return `Aberto agora · até ${closeTime}`;
      }
    }
  }

  return 'Aberto agora';
}

export interface GroupedWeekdayHour {
  label: string;
  hours: string;
  isToday: boolean;
  isClosed: boolean;
}

/**
 * Groups consecutive identical weekday schedules (e.g. Monday..Friday 9h às 19h)
 * while isolating Today ("Hoje · Sábado") so visitors scan hours effortlessly.
 */
export function groupWeekdayHours(
  weekdayDescriptions: string[],
  todayDayIndex: number = new Date().getDay()
): GroupedWeekdayHour[] {
  if (!Array.isArray(weekdayDescriptions) || weekdayDescriptions.length === 0) {
    return [];
  }

  const parsed = weekdayDescriptions.map((line) => {
    const colonIdx = line.indexOf(':');
    const rawDay = (colonIdx >= 0 ? line.slice(0, colonIdx) : line).trim();
    const rawHours = (colonIdx >= 0 ? line.slice(colonIdx + 1) : '').trim();
    const info = WEEKDAY_ORDER_INFO.find((d) =>
      rawDay.toLowerCase().startsWith(d.matchPrefix)
    );
    const compactHours = formatCompactPtBrHours(rawHours);
    return {
      dayIndex: info?.dayIndex ?? -1,
      shortLabel: info?.shortLabel || rawDay,
      hours: compactHours,
      isToday: info ? info.dayIndex === todayDayIndex : false,
      isClosed: /fechado/i.test(compactHours),
    };
  });

  // Sort Monday -> Sunday when Portuguese weekday labels are recognized
  const allRecognized = parsed.every((p) => p.dayIndex !== -1);
  const ordered = allRecognized
    ? [...parsed].sort((a, b) => {
        const orderA = a.dayIndex === 0 ? 7 : a.dayIndex;
        const orderB = b.dayIndex === 0 ? 7 : b.dayIndex;
        return orderA - orderB;
      })
    : parsed;

  const grouped: GroupedWeekdayHour[] = [];
  let i = 0;
  while (i < ordered.length) {
    const curr = ordered[i];
    if (curr.isToday || !curr.hours) {
      grouped.push({
        label: curr.isToday ? `Hoje · ${curr.shortLabel}` : curr.shortLabel,
        hours: curr.hours,
        isToday: curr.isToday,
        isClosed: curr.isClosed,
      });
      i += 1;
      continue;
    }

    let j = i;
    while (
      j + 1 < ordered.length &&
      !ordered[j + 1].isToday &&
      ordered[j + 1].hours === curr.hours &&
      ordered[j + 1].dayIndex !== -1 &&
      curr.dayIndex !== -1
    ) {
      j += 1;
    }

    if (j > i) {
      grouped.push({
        label: `${ordered[i].shortLabel} a ${ordered[j].shortLabel.toLowerCase()}`,
        hours: curr.hours,
        isToday: false,
        isClosed: curr.isClosed,
      });
    } else {
      grouped.push({
        label: curr.shortLabel,
        hours: curr.hours,
        isToday: false,
        isClosed: curr.isClosed,
      });
    }
    i = j + 1;
  }

  return grouped;
}

export function resolveImportedLogoImage(params: {
  existingLogo?: string | null;
  identifiedLogoUrl?: string | null;
  placeId?: string;
  photos?: Array<{
    photoName?: string;
    authorAttributions?: Array<{ displayName: string; uri?: string }>;
  }>;
}): string {
  const existing = String(params.existingLogo || '').trim();
  // 1. Strictly preserve manual existing logo
  if (existing && !isGooglePlacePhotoUrl(existing)) {
    return existing;
  }

  // 2. Prefer explicitly provided / identified logo
  const identified = String(params.identifiedLogoUrl || '').trim();
  if (identified) {
    return identified;
  }

  // 3. Fallback to an imported Google photo as an editable provisional profile image (without claiming official logo)
  const photos = Array.isArray(params.photos) ? params.photos : [];
  if (photos.length > 0) {
    const idxMatch = existing.match(/[?&]idx=(\d+)/);
    const chosenIdx = idxMatch
      ? Math.min(Number(idxMatch[1]), Math.max(0, photos.length - 1))
      : 0;
    return buildPlacePhotoProxyUrl(
      params.placeId || '',
      chosenIdx,
      480,
      photos[chosenIdx]?.photoName
    );
  }

  // 4. Keep absent when no photo is available
  return '';
}

export function buildPlacePhotoProxyUrl(
  placeId: string,
  idx: number,
  width = 960,
  fallbackPhotoName?: string
): string {
  const clampedWidth = Math.min(1600, Math.max(200, Math.round(width || 960)));
  if (placeId && placeId.trim()) {
    return `/api/google/place-photo?placeId=${encodeURIComponent(placeId.trim())}&idx=${Math.max(
      0,
      Math.round(idx)
    )}&w=${clampedWidth}`;
  }
  if (fallbackPhotoName && fallbackPhotoName.trim()) {
    return `/api/google/place-photo?name=${encodeURIComponent(
      fallbackPhotoName.trim()
    )}&w=${clampedWidth}`;
  }
  return '';
}

export function buildGoogleGalleryImages(
  place: Pick<GooglePlaceCandidate, 'placeId' | 'photos' | 'photosUri' | 'googleMapsUri'>,
  maxPhotos = 8
): GalleryPhotoItem[] {
  const originUri = place.photosUri || place.googleMapsUri || '';
  const items: GalleryPhotoItem[] = [];
  for (const [idx, p] of (place.photos || []).slice(0, maxPhotos).entries()) {
    const attr = p.authorAttributions?.[0];
    const url = buildPlacePhotoProxyUrl(place.placeId, idx, 960, p.photoName);
    if (!url) continue;
    items.push({
      url,
      caption: '',
      attributionName: attr?.displayName || 'Google Maps',
      attributionUri: attr?.uri || '',
      originUri,
      googlePlaceId: place.placeId || undefined,
      photoIndex: idx,
    });
  }
  return items;
}

export interface BuildBlocksParams {
  finalName: string;
  heroTitle: string;
  heroSubtitle: string;
  coverImageProxy: string;
  firstPhotoAttr: { displayName: string; uri?: string } | null;
  finalPhone: string;
  finalWhatsapp: string;
  finalAddress: string;
  finalInstagram: string;
  confirmedWebsite: string;
  resolvedMapsUrl: string;
  bodyText: string;
  placeData?: {
    placeId?: string;
    rating?: number | null;
    userRatingCount?: number | null;
    openNow?: boolean | null;
    weekdayDescriptions?: string[];
    directionsUri?: string;
    reviewsUri?: string;
    writeReviewUri?: string;
    photosUri?: string;
    googleMapsUri?: string;
    location?: { lat: number; lng: number } | null;
    reviews?: GoogleReviewItem[];
  } | null;
  galleryImages: GalleryPhotoItem[];
  aiStructured?: {
    ctaLabel?: string;
    sectionTitle?: string;
    services?: Array<{ name: string; description?: string; needsReview?: boolean }>;
  } | null;
}

export function buildMinisiteBlocksFromGooglePlace(
  params: BuildBlocksParams
): Array<{ blockType: string; visible: boolean; content: Record<string, unknown> }> {
  const {
    finalName,
    heroTitle,
    heroSubtitle,
    coverImageProxy,
    firstPhotoAttr,
    finalPhone,
    finalWhatsapp,
    finalAddress,
    finalInstagram,
    confirmedWebsite,
    resolvedMapsUrl,
    bodyText,
    placeData,
    galleryImages,
    aiStructured,
  } = params;

  const canonicalMapsUrl =
    placeData?.googleMapsUri || resolvedMapsUrl || '';
  const canonicalReviewsUri =
    placeData?.reviewsUri || canonicalMapsUrl || '';
  const canonicalWriteReviewUri =
    placeData?.writeReviewUri || canonicalReviewsUri || '';
  const canonicalDirectionsUri =
    placeData?.directionsUri || canonicalMapsUrl || '';

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
        placePhotosUri: placeData?.photosUri || canonicalMapsUrl,
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
  } else if (confirmedWebsite) {
    blocks.push({
      blockType: 'botao_link',
      visible: true,
      content: {
        label: 'Visitar site oficial',
        url: confirmedWebsite,
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

  if (
    canonicalWriteReviewUri ||
    canonicalReviewsUri ||
    placeData?.rating != null
  ) {
    blocks.push({
      blockType: 'avaliacoes_google',
      visible: true,
      content: {
        rating: placeData?.rating ?? null,
        userRatingCount: placeData?.userRatingCount ?? null,
        reviewsUri: canonicalReviewsUri,
        writeReviewUri: canonicalWriteReviewUri,
        label: 'Nos avalie no Google',
        attribution: 'Google Maps',
      },
    });
  }

  if (finalAddress || canonicalDirectionsUri) {
    blocks.push({
      blockType: 'como_chegar',
      visible: true,
      content: {
        address: finalAddress,
        directionsUri: canonicalDirectionsUri,
        label: 'Como chegar',
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

  const realReviews = Array.isArray(placeData?.reviews) ? placeData!.reviews! : [];
  if (
    realReviews.length > 0 ||
    placeData?.rating != null ||
    Boolean(canonicalReviewsUri)
  ) {
    blocks.push({
      blockType: 'avaliacoes',
      visible: true,
      content: {
        title: 'Quem visita recomenda',
        rating: placeData?.rating ?? null,
        userRatingCount: placeData?.userRatingCount ?? null,
        reviewsUri: canonicalReviewsUri,
        writeReviewUri: canonicalWriteReviewUri,
        reviews: realReviews,
      },
    });
  }

  if (placeData?.weekdayDescriptions && placeData.weekdayDescriptions.length > 0) {
    blocks.push({
      blockType: 'horarios',
      visible: true,
      content: {
        title: 'Horário de funcionamento',
        openNow: placeData.openNow ?? null,
        weekdayDescriptions: placeData.weekdayDescriptions,
      },
    });
  }

  if (finalAddress || placeData?.location) {
    blocks.push({
      blockType: 'endereco_mapa',
      visible: true,
      content: {
        title: 'Onde estamos',
        address: finalAddress,
        phone: finalPhone,
        website: confirmedWebsite || '',
        mapsUrl: canonicalMapsUrl,
        directionsUri: canonicalDirectionsUri,
        location: placeData?.location || null,
        showMap: true,
      },
    });
  }

  blocks.push({
    blockType: 'redes_sociais',
    visible: Boolean(finalInstagram || confirmedWebsite),
    content: {
      title: 'Linha de ícones das suas redes',
      instagram: finalInstagram,
      facebook: '',
      youtube: '',
      tiktok: '',
      website: confirmedWebsite || '',
    },
  });

  return blocks;
}

export interface RefreshMergeResult {
  theme: MinisiteTheme;
  blocks: Array<{ blockType: string; visible: boolean; content: Record<string, unknown> }>;
  businessPatch: {
    address?: string;
    phone?: string;
    website?: string;
    googleMapsUrl?: string;
    googlePlaceId?: string;
    sourceMetadataPatch: Record<string, unknown>;
  };
  summary: {
    rating: number | null;
    userRatingCount: number | null;
    reviewsImported: number;
    photosImported: number;
    weekdayHoursImported: number;
    preservedManualMedia: boolean;
    coverAutoFilled: boolean;
  };
}

/**
 * Idempotently refreshes an existing minisite using authoritative Google Places API (New) data
 * while strictly preserving manual uploads (/uploads/...), manual logo, custom text/services,
 * and avoiding duplicate blocks or duplicate gallery entries across repeated runs.
 */
export function mergeGooglePlaceRefresh(params: {
  currentTheme: MinisiteTheme;
  currentBlocks: Array<MinisiteBlockData | { blockType: string; visible: boolean; content: Record<string, unknown> }>;
  currentBusiness: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    googleMapsUrl?: string | null;
    googlePlaceId?: string | null;
  };
  place: GooglePlaceCandidate;
}): RefreshMergeResult {
  const { currentTheme, currentBlocks, currentBusiness, place } = params;
  const googleGallery = buildGoogleGalleryImages(place, 8);
  const firstGooglePhoto = googleGallery[0] || null;

  const existingCover = String(currentTheme.coverImage || '').trim();
  const existingVideo = String(currentTheme.coverVideo || '').trim();
  const existingLogo = String(currentTheme.logoImage || '').trim();

  const isManualCover = Boolean(existingCover && !isGooglePlacePhotoUrl(existingCover));
  const isManualLogo = Boolean(existingLogo && !isGooglePlacePhotoUrl(existingLogo));
  const preservedManualMedia = isManualCover || Boolean(existingVideo) || isManualLogo;

  let nextCoverImage = existingCover;
  let nextPhotoAttr = currentTheme.photoAttribution ?? null;
  let coverAutoFilled = false;

  if (!existingVideo) {
    if (!existingCover && firstGooglePhoto) {
      nextCoverImage = buildPlacePhotoProxyUrl(place.placeId, 0, 1080, place.photos[0]?.photoName);
      nextPhotoAttr = place.photos[0]?.authorAttributions?.[0]
        ? {
            displayName: place.photos[0].authorAttributions[0].displayName,
            uri: place.photos[0].authorAttributions[0].uri,
          }
        : null;
      coverAutoFilled = true;
    } else if (isGooglePlacePhotoUrl(existingCover) && firstGooglePhoto) {
      // Refresh Google cover index ref cleanly without changing user's manual selection index if valid
      const idxMatch = existingCover.match(/[?&]idx=(\d+)/);
      const chosenIdx = idxMatch ? Math.min(Number(idxMatch[1]), Math.max(0, place.photos.length - 1)) : 0;
      nextCoverImage = buildPlacePhotoProxyUrl(
        place.placeId,
        chosenIdx,
        1080,
        place.photos[chosenIdx]?.photoName
      );
      const chosenAttr = place.photos[chosenIdx]?.authorAttributions?.[0];
      nextPhotoAttr = chosenAttr ? { displayName: chosenAttr.displayName, uri: chosenAttr.uri } : null;
    }
  }

  const nextLogoImage = resolveImportedLogoImage({
    existingLogo,
    placeId: place.placeId,
    photos: place.photos,
  });

  const nextTheme: MinisiteTheme = {
    ...currentTheme,
    coverImage: nextCoverImage,
    logoImage: nextLogoImage,
    photoAttribution: isManualCover || existingVideo ? null : nextPhotoAttr,
    placePhotosUri: place.photosUri || place.googleMapsUri || currentTheme.placePhotosUri || '',
    ...(place.openNow != null
      ? {
          showOpenBadge: currentTheme.showOpenBadge ?? true,
          openBadgeText: formatOpenBadgeText(place.openNow, place.weekdayDescriptions),
        }
      : {}),
  };

  const nextBlocks: Array<{ blockType: string; visible: boolean; content: Record<string, unknown> }> =
    currentBlocks.map((b) => ({
      blockType: b.blockType,
      visible: b.visible,
      content: { ...(b.content || {}) },
    }));

  // 1. Update capa block
  const capaIdx = nextBlocks.findIndex((b) => b.blockType === 'capa');
  if (capaIdx >= 0) {
    nextBlocks[capaIdx].content = {
      ...nextBlocks[capaIdx].content,
      image: nextCoverImage,
      photoAttribution: nextTheme.photoAttribution,
      placePhotosUri: nextTheme.placePhotosUri,
      subtitle:
        String(nextBlocks[capaIdx].content.subtitle || '').trim() ||
        place.description ||
        '',
    };
  }

  // 2. Update or insert avaliacoes_google
  const avGoogleIdx = nextBlocks.findIndex((b) => b.blockType === 'avaliacoes_google');
  const reviewsUri = place.reviewsUri || place.googleMapsUri || '';
  const writeReviewUri = place.writeReviewUri || reviewsUri;
  if (avGoogleIdx >= 0) {
    nextBlocks[avGoogleIdx].content = {
      ...nextBlocks[avGoogleIdx].content,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      reviewsUri,
      writeReviewUri,
      attribution: 'Google Maps',
    };
  } else if (place.rating != null || writeReviewUri || reviewsUri) {
    nextBlocks.push({
      blockType: 'avaliacoes_google',
      visible: true,
      content: {
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        reviewsUri,
        writeReviewUri,
        label: 'Nos avalie no Google',
        attribution: 'Google Maps',
      },
    });
  }

  // 3. Update or insert como_chegar
  const comoIdx = nextBlocks.findIndex((b) => b.blockType === 'como_chegar');
  const directionsUri = place.directionsUri || place.googleMapsUri || '';
  if (comoIdx >= 0) {
    nextBlocks[comoIdx].content = {
      ...nextBlocks[comoIdx].content,
      address: place.formattedAddress || nextBlocks[comoIdx].content.address || '',
      directionsUri: directionsUri || nextBlocks[comoIdx].content.directionsUri || '',
    };
  } else if (place.formattedAddress || directionsUri) {
    nextBlocks.push({
      blockType: 'como_chegar',
      visible: true,
      content: {
        address: place.formattedAddress,
        directionsUri,
        label: 'Como chegar',
      },
    });
  }

  // 4. Update or insert avaliacoes (real Google reviews)
  const avIdx = nextBlocks.findIndex((b) => b.blockType === 'avaliacoes');
  if (avIdx >= 0) {
    nextBlocks[avIdx].content = {
      ...nextBlocks[avIdx].content,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      reviewsUri: reviewsUri || nextBlocks[avIdx].content.reviewsUri || '',
      writeReviewUri: writeReviewUri || nextBlocks[avIdx].content.writeReviewUri || '',
      reviews: place.reviews,
    };
  } else if (place.reviews.length > 0 || place.rating != null || reviewsUri) {
    nextBlocks.push({
      blockType: 'avaliacoes',
      visible: true,
      content: {
        title: 'Quem visita recomenda',
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        reviewsUri,
        writeReviewUri,
        reviews: place.reviews,
      },
    });
  }

  // 5. Update or insert galeria idempotently: keep ALL manual uploads, replace Google-sourced photos cleanly
  const galIdx = nextBlocks.findIndex((b) => b.blockType === 'galeria');
  if (galIdx >= 0) {
    const existingImages = Array.isArray(nextBlocks[galIdx].content.images)
      ? (nextBlocks[galIdx].content.images as GalleryPhotoItem[])
      : [];
    const manualImages = existingImages.filter((img) => !isGooglePlacePhotoUrl(img.url));
    nextBlocks[galIdx].content = {
      ...nextBlocks[galIdx].content,
      images: [...manualImages, ...googleGallery],
    };
  } else if (googleGallery.length > 0) {
    nextBlocks.push({
      blockType: 'galeria',
      visible: true,
      content: {
        title: 'Fotos do estabelecimento',
        images: googleGallery,
      },
    });
  }

  // 6. Update or insert horarios
  const horIdx = nextBlocks.findIndex((b) => b.blockType === 'horarios');
  if (place.weekdayDescriptions.length > 0) {
    if (horIdx >= 0) {
      nextBlocks[horIdx].content = {
        ...nextBlocks[horIdx].content,
        openNow: place.openNow,
        weekdayDescriptions: place.weekdayDescriptions,
      };
    } else {
      nextBlocks.push({
        blockType: 'horarios',
        visible: true,
        content: {
          title: 'Horário de funcionamento',
          openNow: place.openNow,
          weekdayDescriptions: place.weekdayDescriptions,
        },
      });
    }
  }

  // 7. Update or insert endereco_mapa
  const mapIdx = nextBlocks.findIndex(
    (b) => b.blockType === 'endereco_mapa' || b.blockType === 'endereco'
  );
  if (mapIdx >= 0) {
    nextBlocks[mapIdx].content = {
      ...nextBlocks[mapIdx].content,
      address: place.formattedAddress || nextBlocks[mapIdx].content.address || '',
      phone: place.phone || nextBlocks[mapIdx].content.phone || '',
      website: place.website || nextBlocks[mapIdx].content.website || '',
      mapsUrl: place.googleMapsUri || nextBlocks[mapIdx].content.mapsUrl || '',
      directionsUri: directionsUri || nextBlocks[mapIdx].content.directionsUri || '',
      location: place.location || nextBlocks[mapIdx].content.location || null,
    };
  } else if (place.formattedAddress || place.location) {
    nextBlocks.push({
      blockType: 'endereco_mapa',
      visible: true,
      content: {
        title: 'Onde estamos',
        address: place.formattedAddress,
        phone: place.phone,
        website: place.website,
        mapsUrl: place.googleMapsUri,
        directionsUri,
        location: place.location,
        showMap: true,
      },
    });
  }

  return {
    theme: nextTheme,
    blocks: nextBlocks,
    businessPatch: {
      address: place.formattedAddress || currentBusiness.address || undefined,
      phone: place.phone || currentBusiness.phone || undefined,
      website: place.website || currentBusiness.website || undefined,
      googleMapsUrl: place.googleMapsUri || currentBusiness.googleMapsUrl || undefined,
      googlePlaceId: place.placeId || currentBusiness.googlePlaceId || undefined,
      sourceMetadataPatch: {
        origin: 'google_places_api_new',
        googleDescription: place.description || '',
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        lastSyncedAt: new Date().toISOString(),
      },
    },
    summary: {
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      reviewsImported: place.reviews.length,
      photosImported: googleGallery.length,
      weekdayHoursImported: place.weekdayDescriptions.length,
      preservedManualMedia,
      coverAutoFilled,
    },
  };
}
