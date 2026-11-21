import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import {
  buildChannelPublicMinisiteUrl,
  buildLocalMinisitePreviewPath,
  buildPublicMinisitePath,
  buildPublicMinisiteUrl,
  buildSlugBaseFromTitle,
  DEFAULT_PUBLIC_BASE_URL,
  extractLegacyPrefixedSlugFromPath,
  extractPublicMinisiteSlugFromPath,
  formatSlugWithSuffix,
  isInternalOrReservedPath,
  isReservedSlug,
  normalizeSlug,
  validateSlug,
} from '../src/lib/slug-utils.ts';
import {
  GoogleMapsQuotaError,
  GooglePlacesApiError,
  clearGooglePlaceCache,
  getPlaceDetailsById,
} from '../src/lib/google-places.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildGoogleGalleryImages,
  buildMinisiteBlocksFromGooglePlace,
  extractCleanBrandTitle,
  formatOpenBadgeText,
  groupWeekdayHours,
  isGooglePlacePhotoUrl,
  mergeGooglePlaceRefresh,
  resolveImportedLogoImage,
} from '../src/lib/minisite-builder.ts';
import { MinisiteRenderer } from '../src/components/MinisiteRenderer.tsx';
import {
  FONT_STYLE_OPTIONS,
  getDefaultPaletteForTemplate,
  SEGMENT_THEMES,
  SITE_STYLE_PRESETS,
} from '../src/lib/minisite-types.ts';
const BASE_THEME = getDefaultPaletteForTemplate('banho_e_tosa').theme;
import { createPool, db } from '../src/db/index.ts';
import {
  auditLogs,
  businesses,
  mediaAssets,
  minisites,
  minisiteSlugAliases,
  profiles,
} from '../src/db/schema.ts';
import {
  createBusinessRecord,
  createMinisiteRecord,
  deleteMinisiteRecord,
  generateUniqueSlug,
  getMediaAssetByFilename,
  getMinisiteDetail,
  getPublishedMinisiteBySlug,
  listMinisiteSlugAliases,
  publishMinisiteSnapshot,
  resolvePublicMinisiteLookup,
  saveMediaAsset,
  SlugValidationError,
  unpublishMinisite,
  updateMinisiteFull,
} from '../src/db/repositories.ts';

function buildPertoPetTijucaApiFixture() {
  return {
    id: 'ChIJPertoPetTijucaMockId',
    displayName: { text: 'Perto Pet Tijuca' },
    primaryType: 'pet_store',
    primaryTypeDisplayName: { text: 'Pet shop' },
    types: ['pet_store', 'point_of_interest', 'establishment'],
    editorialSummary: {
      text: 'Banho, tosa e produtos selecionados para cães e gatos no coração da Tijuca.',
    },
    formattedAddress: 'R. Conde de Bonfim, 412 - Tijuca, Rio de Janeiro - RJ, 20520-054',
    shortFormattedAddress: 'R. Conde de Bonfim, 412 - Tijuca, Rio de Janeiro',
    addressComponents: [
      { longText: 'Tijuca', shortText: 'Tijuca', types: ['sublocality_level_1'] },
      { longText: 'Rio de Janeiro', shortText: 'Rio de Janeiro', types: ['administrative_area_level_2'] },
      { longText: 'Rio de Janeiro', shortText: 'RJ', types: ['administrative_area_level_1'] },
    ],
    nationalPhoneNumber: '(21) 2268-1234',
    internationalPhoneNumber: '+55 21 99876-5432',
    websiteUri: 'https://pertopettijuca.example.com',
    googleMapsUri: 'https://maps.google.com/?cid=998877665544332211',
    googleMapsLinks: {
      directionsUri: 'https://www.google.com/maps/dir/?api=1&destination_place_id=ChIJPertoPetTijucaMockId',
      reviewsUri: 'https://search.google.com/local/reviews?placeid=ChIJPertoPetTijucaMockId',
      writeAReviewUri: 'https://search.google.com/local/writereview?placeid=ChIJPertoPetTijucaMockId',
      photosUri: 'https://www.google.com/maps/place/?q=place_id:ChIJPertoPetTijucaMockId&tab=photos',
      placeUri: 'https://www.google.com/maps/place/?q=place_id:ChIJPertoPetTijucaMockId',
    },
    rating: 4.9,
    userRatingCount: 142,
    businessStatus: 'OPERATIONAL',
    location: { latitude: -22.9261, longitude: -43.2355 },
    currentOpeningHours: {
      openNow: true,
      weekdayDescriptions: [
        'segunda-feira: 09:00–19:00',
        'terça-feira: 09:00–19:00',
        'quarta-feira: 09:00–19:00',
        'quinta-feira: 09:00–19:00',
        'sexta-feira: 09:00–19:00',
        'sábado: 09:00–17:00',
        'domingo: Fechado',
      ],
    },
    reviews: [
      {
        name: 'places/ChIJPertoPetTijucaMockId/reviews/rev1',
        rating: 5,
        relativePublishTimeDescription: 'há 2 semanas',
        text: { text: 'Atendimento impecável com meu cachorro!' },
        authorAttribution: {
          displayName: 'Mariana Costa',
          uri: 'https://www.google.com/maps/contrib/1001',
          photoUri: 'https://lh3.googleusercontent.com/a/avatar1',
        },
        googleMapsUri: 'https://www.google.com/maps/reviews/data=rev1',
      },
      {
        name: 'places/ChIJPertoPetTijucaMockId/reviews/rev2',
        rating: 5,
        relativePublishTimeDescription: 'há 1 mês',
        originalText: { text: 'Banho e tosa muito caprichados na Tijuca.' },
        authorAttribution: {
          displayName: 'Rafael Oliveira',
          uri: 'https://www.google.com/maps/contrib/1002',
          photoUri: 'https://lh3.googleusercontent.com/a/avatar2',
        },
      },
    ],
    photos: [
      {
        name: 'places/ChIJPertoPetTijucaMockId/photos/photo-0',
        widthPx: 1200,
        heightPx: 900,
        authorAttributions: [
          {
            displayName: 'Perto Pet Tijuca',
            uri: 'https://www.google.com/maps/contrib/owner-0',
          },
        ],
      },
      {
        name: 'places/ChIJPertoPetTijucaMockId/photos/photo-1',
        widthPx: 1200,
        heightPx: 800,
        authorAttributions: [
          {
            displayName: 'Cliente Tijuca',
            uri: 'https://www.google.com/maps/contrib/user-1',
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. SLUG & SAME-DOMAIN PATH URL TESTS
// ---------------------------------------------------------------------------

test('Slug utils normalize diacritics, enforce bounds, and reject reserved system paths', () => {
  assert.equal(normalizeSlug('Nosso Pet Favorito!'), 'nosso-pet-favorito');
  assert.equal(normalizeSlug('Clínica São João & Filhos — Tijuca'), 'clinica-sao-joao-filhos-tijuca');
  assert.equal(normalizeSlug('   ---Perto Pet---   '), 'perto-pet');
  assert.equal(normalizeSlug('A'.repeat(100)).length, 64);

  assert.equal(validateSlug('nossopetfavorito').valid, true);
  assert.equal(validateSlug('perto-pet-tijuca').valid, true);

  assert.equal(validateSlug('ab').valid, false);
  assert.equal(validateSlug('a'.repeat(65)).valid, false);
  assert.equal(validateSlug('Nosso Pet!').valid, false);
  assert.equal(validateSlug('nosso--pet').valid, false);

  for (const reserved of ['api', 'admin', 'login', 'assets', 'uploads', 'q', 'demo', 'm', 'minisites']) {
    assert.equal(isReservedSlug(reserved), true, `${reserved} must be reserved`);
    const v = validateSlug(reserved);
    assert.equal(v.valid, false, `validateSlug(${reserved}) must fail`);
    if (reserved.length >= 3) {
      assert.match(v.reason || '', /reservado/i);
    } else {
      assert.match(v.reason || '', /pelo menos 3 caracteres/i);
    }
  }
});

test('Slug base builder and URL builder avoid fake subdomains and preserve internal routes', () => {
  assert.equal(buildSlugBaseFromTitle('Perto Pet Tijuca', false), 'perto-pet-tijuca');
  assert.equal(buildSlugBaseFromTitle('Oi', false), 'oi-site');
  assert.equal(buildSlugBaseFromTitle('Nosso Pet', true), 'nosso-pet-demo');
  assert.equal(formatSlugWithSuffix('perto-pet-tijuca', 1), 'perto-pet-tijuca');
  assert.equal(formatSlugWithSuffix('perto-pet-tijuca', 2), 'perto-pet-tijuca-2');

  const canonicalDefaultUrl = buildPublicMinisiteUrl('nosso-pet-favorito');
  assert.equal(canonicalDefaultUrl, `${DEFAULT_PUBLIC_BASE_URL}/nosso-pet-favorito`);
  assert.equal(buildPublicMinisitePath('nosso-pet-favorito'), '/nosso-pet-favorito');
  assert.equal(
    buildChannelPublicMinisiteUrl('nosso-pet-favorito', 'instagram'),
    'https://linkfoco.vercel.app/nosso-pet-favorito?src=instagram'
  );
  assert.equal(
    buildLocalMinisitePreviewPath('nosso-pet-favorito', 'publicado'),
    '/nosso-pet-favorito'
  );
  assert.equal(
    buildLocalMinisitePreviewPath('nosso-pet-favorito', 'rascunho'),
    '/demo/nosso-pet-favorito'
  );

  const runtimeUrl = buildPublicMinisiteUrl('nossopetfavorito', {
    origin: 'https://app.cliente.com.br',
  });
  assert.equal(runtimeUrl, 'https://app.cliente.com.br/nossopetfavorito');
  assert.doesNotMatch(runtimeUrl, /focoleads360/i);

  const envUrl = buildPublicMinisiteUrl('nossopetfavorito', {
    origin: 'http://localhost:3000',
    publicBaseUrl: 'https://meudominio.com.br/',
  });
  assert.equal(envUrl, 'https://meudominio.com.br/nossopetfavorito');

  for (const internalPath of [
    '/',
    '/api/health',
    '/admin',
    '/login',
    '/uploads/logo.png',
    '/assets/main.js',
    '/q/abc123',
    '/demo/nossopetfavorito',
    '/m/nossopetfavorito',
    '/qr-codes',
    '/minisites',
    '/minisites/12/editar',
    '/configuracoes',
    '/crm',
    '/prospeccao',
    '/scripts',
    '/empresas',
    '/equipe',
    '/logs',
    '/linkfoco',
    '/s',
    '/LinkFoco/admin',
    '/s/admin',
    '/robots.txt',
    '/favicon.ico',
    '/sitemap.xml',
    '/manifest.json',
    '/sw.js',
    '/.well-known',
    '/ab',
  ]) {
    assert.equal(
      isInternalOrReservedPath(internalPath),
      true,
      `${internalPath} must remain internal`
    );
    assert.equal(extractPublicMinisiteSlugFromPath(internalPath), null);
  }

  for (const publicSlugPath of [
    '/nossopetfavorito',
    '/perto-pet-tijuca',
    '/clinica-vet-2',
    '/LinkFoco/nossopetfavorito',
    '/linkfoco/perto-pet-tijuca',
    '/s/nosso-pet-favorito',
  ]) {
    assert.equal(
      isInternalOrReservedPath(publicSlugPath),
      false,
      `${publicSlugPath} must route to public minisite handler`
    );
  }

  assert.equal(extractPublicMinisiteSlugFromPath('/nossopetfavorito'), 'nossopetfavorito');
  assert.equal(extractPublicMinisiteSlugFromPath('/LinkFoco/nossopetfavorito'), 'nossopetfavorito');
  assert.equal(extractPublicMinisiteSlugFromPath('/linkfoco/perto-pet-tijuca'), 'perto-pet-tijuca');
  assert.equal(extractPublicMinisiteSlugFromPath('/s/nosso-pet-favorito'), 'nosso-pet-favorito');
  assert.equal(extractLegacyPrefixedSlugFromPath('/nossopetfavorito'), null);
  assert.equal(extractLegacyPrefixedSlugFromPath('/LinkFoco/nossopetfavorito'), 'nossopetfavorito');
  assert.equal(extractLegacyPrefixedSlugFromPath('/s/nosso-pet-favorito'), 'nosso-pet-favorito');
  assert.equal(extractLegacyPrefixedSlugFromPath('/s/admin'), null);
});

// ---------------------------------------------------------------------------
// 2. GOOGLE PLACES API (NEW) - PERTO PET TIJUCA EXTRACTION & ERROR HANDLING
// ---------------------------------------------------------------------------

test('getPlaceDetailsById queries Place Details (New) with required field mask and maps Perto Pet Tijuca completely', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  });

  process.env.GOOGLE_MAPS_API_KEY = 'test-gmp-key';
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers || {}) as Record<string, string>;
    return new Response(JSON.stringify(buildPertoPetTijucaApiFixture()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const place = await getPlaceDetailsById('ChIJPertoPetTijucaMockId');

  assert.match(capturedUrl, /places\/ChIJPertoPetTijucaMockId/);
  const mask = capturedHeaders['X-Goog-FieldMask'] || '';
  for (const field of ['rating', 'userRatingCount', 'reviews', 'photos', 'googleMapsLinks', 'googleMapsUri']) {
    assert.ok(mask.includes(field), `FieldMask must contain ${field}`);
  }

  assert.equal(place.placeId, 'ChIJPertoPetTijucaMockId');
  assert.equal(place.name, 'Perto Pet Tijuca');
  assert.equal(place.rating, 4.9);
  assert.equal(place.userRatingCount, 142);
  assert.equal(place.reviews.length, 2);
  assert.equal(place.reviews[0].authorName, 'Mariana Costa');
  assert.equal(place.reviews[0].authorUri, 'https://www.google.com/maps/contrib/1001');
  assert.equal(place.reviews[0].authorPhotoUri, 'https://lh3.googleusercontent.com/a/avatar1');
  assert.equal(place.reviews[0].reviewUri, 'https://www.google.com/maps/reviews/data=rev1');
  assert.equal(place.photos.length, 2);
  assert.equal(place.photos[0].authorAttributions[0].displayName, 'Perto Pet Tijuca');
  assert.match(place.photosUri, /tab=photos/);
  assert.match(place.reviewsUri, /reviews/);
  assert.match(place.writeReviewUri, /writereview/);
  assert.match(place.directionsUri, /maps\/dir/);
  assert.deepEqual(place.location, { lat: -22.9261, lng: -43.2355 });
  assert.equal(place.weekdayDescriptions.length, 7);
});

test('getPlaceDetailsById surfaces clear HTTP/API errors instead of masking failures', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalViteKey = process.env.VITE_GOOGLE_MAPS_API_KEY;

  clearGooglePlaceCache('ChIJPertoPetTijucaMockId');

  t.after(() => {
    clearGooglePlaceCache('ChIJPertoPetTijucaMockId');
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
    if (originalViteKey === undefined) delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    else process.env.VITE_GOOGLE_MAPS_API_KEY = originalViteKey;
  });

  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.VITE_GOOGLE_MAPS_API_KEY;
  await assert.rejects(
    () => getPlaceDetailsById('ChIJPertoPetTijucaMockId'),
    (err: unknown) => err instanceof GooglePlacesApiError && err.code === 'GMP_KEY_MISSING'
  );

  process.env.GOOGLE_MAPS_API_KEY = 'test-gmp-key';

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'API key restricted' } }),
      { status: 403 }
    )) as typeof fetch;

  await assert.rejects(
    () => getPlaceDetailsById('ChIJPertoPetTijucaMockId'),
    (err: unknown) =>
      err instanceof GooglePlacesApiError &&
      err.status === 403 &&
      /permissão|chave/i.test(err.message)
  );

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }),
      { status: 429 }
    )) as typeof fetch;

  await assert.rejects(
    () => getPlaceDetailsById('ChIJPertoPetTijucaMockId'),
    (err: unknown) => err instanceof GoogleMapsQuotaError && err.status === 429
  );
});

// ---------------------------------------------------------------------------
// 3. BLOCK BUILDER & IDEMPOTENT REFRESH TESTS
// ---------------------------------------------------------------------------

test('buildMinisiteBlocksFromGooglePlace preserves all Place Details without storing raw photoName tokens in gallery URLs', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  });

  process.env.GOOGLE_MAPS_API_KEY = 'test-gmp-key';
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(buildPertoPetTijucaApiFixture()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  const place = await getPlaceDetailsById('ChIJPertoPetTijucaMockId');
  const gallery = buildGoogleGalleryImages(place, 8);
  assert.equal(gallery.length, 2);
  assert.ok(isGooglePlacePhotoUrl(gallery[0].url));
  assert.match(gallery[0].url, /\?placeId=ChIJPertoPetTijucaMockId&idx=0/);
  assert.doesNotMatch(gallery[0].url, /\/photos\/photo-0/);
  assert.equal(gallery[0].attributionName, 'Perto Pet Tijuca');
  assert.equal(gallery[0].originUri, place.photosUri);

  const blocks = buildMinisiteBlocksFromGooglePlace({
    finalName: place.name,
    heroTitle: place.name,
    heroSubtitle: place.description,
    coverImageProxy: '/api/google/place-photo?placeId=ChIJPertoPetTijucaMockId&idx=0&w=1080',
    firstPhotoAttr: place.photos[0].authorAttributions[0],
    finalPhone: place.phone,
    finalWhatsapp: place.whatsappCandidate,
    finalAddress: place.formattedAddress,
    finalInstagram: '',
    confirmedWebsite: place.website,
    resolvedMapsUrl: place.googleMapsUri,
    bodyText: place.description,
    placeData: place,
    galleryImages: gallery,
    aiStructured: {
      ctaLabel: 'Chamar no WhatsApp',
      sectionTitle: 'Serviços para seu pet',
      services: [{ name: 'Banho e Tosa', description: 'Atendimento especializado' }],
    },
  });

  const capa = blocks.find((b) => b.blockType === 'capa');
  const avGoogle = blocks.find((b) => b.blockType === 'avaliacoes_google');
  const avReal = blocks.find((b) => b.blockType === 'avaliacoes');
  const gal = blocks.find((b) => b.blockType === 'galeria');
  const hor = blocks.find((b) => b.blockType === 'horarios');
  const mapa = blocks.find((b) => b.blockType === 'endereco_mapa');

  assert.ok(capa && avGoogle && avReal && gal && hor && mapa);
  assert.equal(capa.content.placePhotosUri, place.photosUri);
  assert.equal(avGoogle.content.rating, 4.9);
  assert.equal(avGoogle.content.userRatingCount, 142);
  assert.equal(avGoogle.content.writeReviewUri, place.writeReviewUri);
  assert.equal((avReal.content.reviews as unknown[]).length, 2);
  assert.equal((gal.content.images as unknown[]).length, 2);
  assert.equal((hor.content.weekdayDescriptions as string[]).length, 7);
  assert.deepEqual(mapa.content.location, { lat: -22.9261, lng: -43.2355 });
});

test('mergeGooglePlaceRefresh is strictly idempotent and preserves manual cover, logo, and gallery media', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  });

  process.env.GOOGLE_MAPS_API_KEY = 'test-gmp-key';
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(buildPertoPetTijucaApiFixture()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  const place = await getPlaceDetailsById('ChIJPertoPetTijucaMockId');

  // Case A: empty cover & empty logo -> auto-fills cover and provisional editable profile image
  const emptyMediaMerge = mergeGooglePlaceRefresh({
    currentTheme: { ...BASE_THEME, coverImage: '', logoImage: '' },
    currentBlocks: [{ blockType: 'capa', visible: true, content: { title: 'Perto Pet', subtitle: '' } }],
    currentBusiness: { name: 'Perto Pet Tijuca' },
    place,
  });
  assert.match(emptyMediaMerge.theme.coverImage || '', /\/api\/google\/place-photo\?placeId=/);
  assert.equal(
    emptyMediaMerge.theme.logoImage,
    '/api/google/place-photo?placeId=ChIJPertoPetTijucaMockId&idx=0&w=480'
  );
  assert.equal(emptyMediaMerge.summary.coverAutoFilled, true);
  assert.equal(emptyMediaMerge.summary.preservedManualMedia, false);

  // Case B: manual /uploads/... cover, logo, and manual photo in gallery + second idempotent run
  const manualCoverUrl = '/uploads/manual-capa.jpg';
  const manualLogoUrl = '/uploads/manual-logo.png';
  const manualGalleryItem = {
    url: '/uploads/manual-foto.jpg',
    caption: 'Foto oficial enviada manualmente',
  };

  const firstRun = mergeGooglePlaceRefresh({
    currentTheme: {
      ...BASE_THEME,
      coverImage: manualCoverUrl,
      logoImage: manualLogoUrl,
    },
    currentBlocks: [
      { blockType: 'capa', visible: true, content: { title: 'Perto Pet', subtitle: 'Texto manual' } },
      {
        blockType: 'galeria',
        visible: true,
        content: {
          title: 'Fotos',
          images: [
            manualGalleryItem,
            { url: '/api/google/place-photo?placeId=ChIJPertoPetTijucaMockId&idx=0&w=960', caption: '' },
          ],
        },
      },
    ],
    currentBusiness: { name: 'Perto Pet Tijuca' },
    place,
  });

  assert.equal(firstRun.theme.coverImage, manualCoverUrl);
  assert.equal(firstRun.theme.logoImage, manualLogoUrl);
  assert.equal(firstRun.theme.photoAttribution, null);
  assert.equal(firstRun.summary.preservedManualMedia, true);
  assert.equal(firstRun.summary.coverAutoFilled, false);

  const secondRun = mergeGooglePlaceRefresh({
    currentTheme: firstRun.theme,
    currentBlocks: firstRun.blocks,
    currentBusiness: { name: 'Perto Pet Tijuca', googlePlaceId: place.placeId },
    place,
  });

  assert.equal(secondRun.blocks.length, firstRun.blocks.length);
  const galFirst = firstRun.blocks.find((b) => b.blockType === 'galeria')!;
  const galSecond = secondRun.blocks.find((b) => b.blockType === 'galeria')!;
  const imgsSecond = galSecond.content.images as Array<{ url: string }>;
  assert.equal(imgsSecond.length, (galFirst.content.images as unknown[]).length);
  assert.equal(imgsSecond[0].url, manualGalleryItem.url);
  assert.equal(imgsSecond.length, 3); // 1 manual + 2 Google photos, zero duplicates

  // Case C: missing optional Google fields (no reviews, no photos, no weekday hours)
  const sparsePlace = {
    ...place,
    rating: null,
    userRatingCount: null,
    reviews: [],
    photos: [],
    weekdayDescriptions: [],
    openNow: null,
  };
  const sparseMerge = mergeGooglePlaceRefresh({
    currentTheme: { ...BASE_THEME, coverImage: '', logoImage: '' },
    currentBlocks: [{ blockType: 'capa', visible: true, content: { title: 'Empresa Sem Fotos', subtitle: '' } }],
    currentBusiness: { name: 'Empresa Sem Fotos' },
    place: sparsePlace,
  });
  assert.equal(sparseMerge.theme.coverImage, '');
  assert.equal(sparseMerge.theme.logoImage, '');
  assert.equal(sparseMerge.summary.reviewsImported, 0);
  assert.equal(sparseMerge.summary.photosImported, 0);
});

test('resolveImportedLogoImage follows precedence and MinisiteRenderer renders clean media, attributions below, and non-circular logo outside photo', () => {
  const photos = [
    { photoName: 'places/P1/photos/0', authorAttributions: [{ displayName: 'Autor Um', uri: 'https://maps.google.com/u1' }] },
    { photoName: 'places/P1/photos/1', authorAttributions: [{ displayName: 'Autor Dois' }] },
  ];

  // 1. Preserve manual existing logo
  assert.equal(
    resolveImportedLogoImage({
      existingLogo: '/uploads/logo-manual.png',
      identifiedLogoUrl: 'https://cdn.example.com/logo.png',
      placeId: 'P1',
      photos,
    }),
    '/uploads/logo-manual.png'
  );

  // 2. Prefer provided / identified logo when no manual logo exists
  assert.equal(
    resolveImportedLogoImage({
      existingLogo: '',
      identifiedLogoUrl: 'https://cdn.example.com/logo-oficial.png',
      placeId: 'P1',
      photos,
    }),
    'https://cdn.example.com/logo-oficial.png'
  );

  // 3. Fallback to imported photo as provisional editable profile image
  assert.equal(
    resolveImportedLogoImage({
      existingLogo: '',
      placeId: 'P1',
      photos,
    }),
    '/api/google/place-photo?placeId=P1&idx=0&w=480'
  );

  // 3b. Preserve user-picked Google photo index across refresh
  assert.equal(
    resolveImportedLogoImage({
      existingLogo: '/api/google/place-photo?placeId=P1&idx=1&w=480',
      placeId: 'P1',
      photos,
    }),
    '/api/google/place-photo?placeId=P1&idx=1&w=480'
  );

  // 4. Absent when no photo exists
  assert.equal(resolveImportedLogoImage({ existingLogo: '', placeId: 'P1', photos: [] }), '');

  // Shared Renderer check with Google cover, logo, and gallery
  const htmlWithPhotos = renderToStaticMarkup(
    React.createElement(MinisiteRenderer, {
      minisite: {
        title: 'Perto Pet Tijuca',
        slug: 'perto-pet-tijuca',
        theme: {
          ...BASE_THEME,
          coverImage: '/api/google/place-photo?placeId=P1&idx=0&w=1080',
          logoImage: '/api/google/place-photo?placeId=P1&idx=0&w=480',
          photoAttribution: { displayName: 'Autor Um', uri: 'https://maps.google.com/u1' },
          placePhotosUri: 'https://www.google.com/maps/place/?q=place_id:P1&tab=photos',
        },
        business: {
          name: 'Perto Pet Tijuca',
          googleMapsUrl: 'https://maps.google.com/?cid=123',
        },
        blocks: [
          { blockType: 'capa', position: 0, visible: true, content: { title: 'Perto Pet Tijuca', subtitle: 'Banho e tosa' } },
          {
            blockType: 'galeria',
            position: 1,
            visible: true,
            content: {
              title: 'Fotos',
              images: [
                {
                  url: '/api/google/place-photo?placeId=P1&idx=1&w=960',
                  attributionName: 'Autor Dois',
                  originUri: 'https://www.google.com/maps/place/?q=place_id:P1&tab=photos',
                  googlePlaceId: 'P1',
                  photoIndex: 1,
                },
              ],
            },
          },
        ],
      },
    })
  );

  // No decorative corner circles, no dark overlay badges, no circular logo frame, and NO "Foto: ... · Google" captions below cover/gallery photos
  assert.doesNotMatch(htmlWithPhotos, /-top-8 -right-8|-bottom-10 -left-8|bg-black\/45|bg-black\/55/);
  assert.doesNotMatch(htmlWithPhotos, /class="w-14 h-14 rounded-full/);
  assert.match(htmlWithPhotos, /class="w-14 h-14 rounded-xl/);
  assert.doesNotMatch(htmlWithPhotos, /Foto:/);
  assert.doesNotMatch(htmlWithPhotos, /Autor Um/);
  assert.doesNotMatch(htmlWithPhotos, /Autor Dois/);

  // Cover photo, non-circular logo outside cover photo, and h1 appear in expected order
  const coverImgEnd = htmlWithPhotos.indexOf('<img src="/api/google/place-photo?placeId=P1&amp;idx=0&amp;w=1080"');
  const logoPos = htmlWithPhotos.indexOf('<img src="/api/google/place-photo?placeId=P1&amp;idx=0&amp;w=480"');
  const titlePos = htmlWithPhotos.indexOf('<h1');
  assert.ok(coverImgEnd > 0 && logoPos > coverImgEnd && titlePos > logoPos, 'Logo must appear outside cover photo next to name');

  // When no photo/logo exists, no logo <img> or decorative initials circle is rendered
  const htmlWithoutPhotos = renderToStaticMarkup(
    React.createElement(MinisiteRenderer, {
      minisite: {
        title: 'Empresa Sem Foto',
        slug: 'empresa-sem-foto',
        theme: { ...BASE_THEME, coverImage: '', logoImage: '' },
        business: { name: 'Empresa Sem Foto' },
        blocks: [{ blockType: 'capa', position: 0, visible: true, content: { title: 'Empresa Sem Foto', subtitle: '' } }],
      },
    })
  );
  assert.doesNotMatch(htmlWithoutPhotos, /<img /);
  assert.doesNotMatch(htmlWithoutPhotos, /rounded-full.*EM<\/div>/);
});

test('extractCleanBrandTitle, formatOpenBadgeText, groupWeekdayHours, and Place Details cache work cleanly', async () => {
  // Clean brand title removes uppercase SEO descriptors while preserving clean brand names
  assert.equal(
    extractCleanBrandTitle('PET SHOP BANHO E TOSA NA TIJUCA – NOSSO PET FAVORITO'),
    'Nosso Pet Favorito'
  );
  assert.equal(extractCleanBrandTitle('PERTO PET TIJUCA'), 'Perto Pet Tijuca');
  assert.equal(extractCleanBrandTitle('Perto Pet Tijuca'), 'Perto Pet Tijuca');

  const sampleWeekdays = [
    'segunda-feira: 09:00 – 19:00',
    'terça-feira: 09:00 – 19:00',
    'quarta-feira: 09:00 – 19:00',
    'quinta-feira: 09:00 – 19:00',
    'sexta-feira: 09:00 – 19:00',
    'sábado: 09:00 – 17:00',
    'domingo: Fechado',
  ];

  // Saturday (dayIndex = 6) -> "Aberto agora · até 17h"
  const satNoon = new Date('2026-11-21T12:00:00');
  assert.equal(
    formatOpenBadgeText(true, sampleWeekdays, satNoon),
    'Aberto agora · até 17h'
  );
  assert.equal(
    formatOpenBadgeText(false, sampleWeekdays, satNoon),
    'Fechado no momento'
  );

  // Grouped hours on Saturday highlight Today and collapse Mon-Fri
  const grouped = groupWeekdayHours(sampleWeekdays, 6);
  assert.deepEqual(grouped, [
    { label: 'Segunda a sexta', hours: '9h às 19h', isToday: false, isClosed: false },
    { label: 'Hoje · Sábado', hours: '9h às 17h', isToday: true, isClosed: false },
    { label: 'Domingo', hours: 'Fechado', isToday: false, isClosed: true },
  ]);

  // Renderer displays grouped schedule and places gallery before services block
  const blocks = buildMinisiteBlocksFromGooglePlace({
    finalName: 'Nosso Pet Favorito',
    heroTitle: 'Nosso Pet Favorito',
    heroSubtitle: 'Banho e tosa na Tijuca com carinho, paciência e capricho.',
    coverImageProxy: '/api/google/place-photo?placeId=P1&idx=0&w=1080',
    firstPhotoAttr: null,
    finalPhone: '(21) 97117-1244',
    finalWhatsapp: '5521971171244',
    finalAddress: 'Rua Conde de Bonfim, 831 - Lj A - Tijuca, Rio de Janeiro - RJ, 20520-053',
    finalInstagram: 'nossopetfavorito',
    confirmedWebsite: '',
    resolvedMapsUrl: 'https://maps.google.com/?cid=999',
    bodyText: 'Equipe carinhosa e paciente e loja sempre limpa.',
    placeData: {
      placeId: 'P1',
      rating: 4.9,
      userRatingCount: 274,
      openNow: true,
      weekdayDescriptions: sampleWeekdays,
      reviews: [
        {
          authorName: 'Any',
          rating: 5,
          relativeTime: 'há 1 semana',
          text: 'Estava tão difícil encontrar um pet shop com tanto profissionalismo.',
        },
      ],
    },
    galleryImages: [{ url: '/api/google/place-photo?placeId=P1&idx=1&w=960', caption: '' }],
    aiStructured: {
      sectionTitle: 'O que fazemos pelo seu pet',
      services: [{ name: 'Banho', description: 'Banho caprichado com carinho.' }],
    },
  });

  const galIdx = blocks.findIndex((b) => b.blockType === 'galeria');
  const secIdx = blocks.findIndex((b) => b.blockType === 'titulo_secao');
  assert.ok(galIdx >= 0 && secIdx > galIdx, 'Gallery must appear before services section');

  const rendered = renderToStaticMarkup(
    React.createElement(MinisiteRenderer, {
      minisite: {
        title: 'Nosso Pet Favorito',
        slug: 'nosso-pet-favorito',
        theme: {
          ...BASE_THEME,
          showOpenBadge: true,
          openBadgeText: 'Aberto agora · até 17h',
        },
        business: {
          name: 'Nosso Pet Favorito',
          address: 'Rua Conde de Bonfim, 831 - Lj A - Tijuca, Rio de Janeiro - RJ, 20520-053',
        },
        blocks: blocks.map((b, i) => ({ ...b, position: i })),
      },
    })
  );
  assert.match(rendered, /Aberto agora · até 17h/);
  assert.match(rendered, /Segunda a sexta/);
  assert.match(rendered, /9h às 19h/);
  assert.doesNotMatch(rendered, /Foto:/);

  // Place Details cache deduplicates repeat calls within TTL unless forceRefresh=true
  clearGooglePlaceCache('ChIJCachedTest');
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test-fake-key';
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        id: 'ChIJCachedTest',
        displayName: { text: 'Nosso Pet Favorito' },
        rating: 4.9,
        userRatingCount: 274,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const first = await getPlaceDetailsById('ChIJCachedTest');
    const second = await getPlaceDetailsById('ChIJCachedTest');
    assert.equal(first.name, 'Nosso Pet Favorito');
    assert.equal(second.name, 'Nosso Pet Favorito');
    assert.equal(fetchCount, 1);

    await getPlaceDetailsById('ChIJCachedTest', { forceRefresh: true });
    assert.equal(fetchCount, 2);
  } finally {
    clearGooglePlaceCache('ChIJCachedTest');
    globalThis.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = prevKey;
  }
});

test('Unified hero card, site styles, 13 segment themes, soft buttons, carousel layout, and WhatsApp default message work cleanly', () => {
  assert.deepEqual(
    SITE_STYLE_PRESETS.map((s) => s.id),
    ['classico', 'vitrine', 'luxo', 'vibrante']
  );
  assert.equal(SEGMENT_THEMES.length, 13);
  assert.equal(FONT_STYLE_OPTIONS.length, 4);

  const rendered = renderToStaticMarkup(
    React.createElement(MinisiteRenderer, {
      minisite: {
        title: 'Nosso Pet Favorito',
        slug: 'nosso-pet-favorito',
        theme: {
          ...BASE_THEME,
          siteStyle: 'vitrine',
          buttonStyle: 'soft',
          buttonRadius: 'xl',
          servicesLayout: 'carousel',
          fontFamily: 'Nunito',
          coverImage: '/uploads/cover.jpg',
          logoImage: '/uploads/logo.png',
          fixedWhatsappButton: true,
          whatsappDefaultMessage: 'Oi! Vim pelo site e quero agendar um banho.',
          showOpenBadge: true,
          openBadgeText: 'Aberto agora · até 17h',
        },
        business: {
          name: 'Nosso Pet Favorito',
          whatsapp: '21971171244',
        },
        blocks: [
          {
            blockType: 'capa',
            position: 0,
            visible: true,
            content: { title: 'Nosso Pet Favorito', subtitle: 'Banho e tosa na Tijuca com carinho.' },
          },
          {
            blockType: 'botao_link',
            position: 1,
            visible: true,
            content: { label: 'Instagram', url: 'https://instagram.com/nossopetfavorito', icon: 'instagram' },
          },
          {
            blockType: 'produto_servico',
            position: 2,
            visible: true,
            content: { name: 'Banho', description: 'Banho completo', price: 'R$ 60' },
          },
          {
            blockType: 'produto_servico',
            position: 3,
            visible: true,
            content: { name: 'Tosa', description: 'Tosa na tesoura', price: 'R$ 90' },
          },
        ],
      },
    })
  );

  assert.match(rendered, /Nosso Pet Favorito/);
  assert.match(rendered, /Banho e tosa na Tijuca com carinho\./);
  assert.match(rendered, /w-14 h-14 rounded-xl/);
  assert.match(rendered, /overflow-x-auto snap-x/);
  assert.match(rendered, /box-shadow:none/);
  assert.match(rendered, /font-family:(?:'|&#x27;)Nunito(?:'|&#x27;)/i);
  assert.match(rendered, /wa\.me\/21971171244\?text=Oi!%20Vim%20pelo%20site%20e%20quero%20agendar%20um%20banho\./);
});

// ---------------------------------------------------------------------------
// 4. DATABASE PUBLISHING LIFECYCLE, COLLISIONS & SNAPSHOT ISOLATION
// ---------------------------------------------------------------------------

test('Database publishing lifecycle enforces unique slugs, snapshot isolation, draft protection, and unpublish 404', async () => {
  const hasDbConfig = Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME);
  if (!hasDbConfig) {
    return;
  }

  const uniqueSuffix = Date.now().toString(36);
  const createdMinisiteIds: number[] = [];
  let createdBusinessId: number | null = null;
  let createdTempProfileId: number | null = null;

  try {
    const existingProfile = await db.select({ id: profiles.id }).from(profiles).limit(1);
    let actorId: number;
    if (existingProfile.length > 0) {
      actorId = existingProfile[0].id;
    } else {
      const [tempProfile] = await db
        .insert(profiles)
        .values({
          uid: `test-uid-${uniqueSuffix}`,
          email: `test-${uniqueSuffix}@example.com`,
          fullName: 'Test Runner',
          role: 'administrador',
          active: true,
        })
        .returning();
      createdTempProfileId = tempProfile.id;
      actorId = tempProfile.id;
    }

    // Reserved title "Admin" must never allocate reserved slug "admin"
    const safeReservedSlug = await generateUniqueSlug('Admin', false);
    assert.notEqual(safeReservedSlug, 'admin');
    assert.equal(isReservedSlug(safeReservedSlug), false);

    const business = await createBusinessRecord({
      name: `Perto Pet Tijuca Teste ${uniqueSuffix}`,
      category: 'Pet shop',
      city: 'Rio de Janeiro',
      isDemo: false,
      actorId,
    });
    createdBusinessId = business.id;

    const baseTitle = `Perto Pet Tijuca ${uniqueSuffix}`;
    const m1 = await createMinisiteRecord({
      businessId: business.id,
      title: baseTitle,
      status: 'rascunho',
      templateId: 'banho_e_tosa',
      theme: { ...BASE_THEME },
      seo: { title: baseTitle, description: 'Rascunho inicial' },
      blocks: [{ blockType: 'capa', visible: true, content: { title: 'Versão V1', subtitle: 'Inicial' } }],
      isDemo: false,
      actorId,
    });
    createdMinisiteIds.push(m1.id);

    // Second minisite with exact same title gets automatic numeric suffix (-2)
    const m2 = await createMinisiteRecord({
      businessId: business.id,
      title: baseTitle,
      status: 'rascunho',
      templateId: 'banho_e_tosa',
      theme: { ...BASE_THEME },
      seo: { title: baseTitle, description: 'Segundo' },
      blocks: [{ blockType: 'capa', visible: true, content: { title: 'Segundo', subtitle: '' } }],
      isDemo: false,
      actorId,
    });
    createdMinisiteIds.push(m2.id);

    assert.equal(m1.slug, `perto-pet-tijuca-${uniqueSuffix}`);
    assert.equal(m2.slug, `perto-pet-tijuca-${uniqueSuffix}-2`);

    // Draft must NOT be returned as public
    assert.equal(await getPublishedMinisiteBySlug(m1.slug, false), null);

    // Reject reserved slug and duplicate slug edits
    await assert.rejects(
      () =>
        updateMinisiteFull({
          minisiteId: m1.id,
          title: m1.title,
          slug: 'admin',
          templateId: m1.templateId,
          theme: m1.theme as Record<string, unknown>,
          seo: m1.seo as Record<string, unknown>,
          blocks: [],
          actorId,
        }),
      (err: unknown) => err instanceof SlugValidationError && err.status === 400
    );

    await assert.rejects(
      () =>
        updateMinisiteFull({
          minisiteId: m1.id,
          title: m1.title,
          slug: m2.slug,
          templateId: m1.templateId,
          theme: m1.theme as Record<string, unknown>,
          seo: m1.seo as Record<string, unknown>,
          blocks: [],
          actorId,
        }),
      (err: unknown) => err instanceof SlugValidationError && err.status === 409
    );

    // Publish V1 snapshot
    await publishMinisiteSnapshot({ minisiteId: m1.id, actorId });
    const pubV1 = (await getPublishedMinisiteBySlug(m1.slug, false)) as Record<string, unknown> | null;
    assert.ok(pubV1);
    assert.equal(pubV1.title, baseTitle);

    // Edit draft to V2 WITHOUT republishing -> public snapshot remains V1
    await new Promise((r) => setTimeout(r, 1100));
    await updateMinisiteFull({
      minisiteId: m1.id,
      title: `${baseTitle} V2 Rascunho`,
      templateId: m1.templateId,
      theme: m1.theme as Record<string, unknown>,
      seo: m1.seo as Record<string, unknown>,
      blocks: [{ blockType: 'capa', visible: true, content: { title: 'Versão V2', subtitle: 'Editada' } }],
      actorId,
    });

    const detailAfterEdit = await getMinisiteDetail({ id: m1.id, incrementViews: false });
    assert.equal(detailAfterEdit?.hasUnpublishedChanges, true);

    const stillV1Public = (await getPublishedMinisiteBySlug(m1.slug, false)) as Record<string, unknown> | null;
    assert.ok(stillV1Public);
    assert.equal(stillV1Public.title, baseTitle);

    // Republish -> public snapshot updates to V2
    await publishMinisiteSnapshot({ minisiteId: m1.id, actorId });
    const pubV2 = (await getPublishedMinisiteBySlug(m1.slug, false)) as Record<string, unknown> | null;
    assert.ok(pubV2);
    assert.equal(pubV2.title, `${baseTitle} V2 Rascunho`);

    // Slug rename on published minisite persists old slug as alias and protects against collisions & loops
    const slugA = m1.slug;
    const slugB = `nosso-pet-novo-${uniqueSuffix}`;
    const slugC = `nosso-pet-final-${uniqueSuffix}`;

    const renamedToB = await updateMinisiteFull({
      minisiteId: m1.id,
      title: `${baseTitle} V2 Rascunho`,
      slug: slugB,
      templateId: m1.templateId,
      theme: m1.theme as Record<string, unknown>,
      seo: m1.seo as Record<string, unknown>,
      blocks: [{ blockType: 'capa', visible: true, content: { title: 'Versão V2', subtitle: 'Editada' } }],
      actorId,
    });
    assert.equal(renamedToB?.slug, slugB);

    // Direct lookup for new slugB succeeds; lookup for old slugA yields 1-hop redirect to slugB
    const lookupB = await resolvePublicMinisiteLookup(slugB, false);
    assert.equal(lookupB.kind, 'found');
    if (lookupB.kind === 'found') {
      assert.equal(lookupB.canonicalSlug, slugB);
      assert.equal((lookupB.minisite as { slug?: string }).slug, slugB);
    }
    const lookupA = await resolvePublicMinisiteLookup(slugA, false);
    assert.equal(lookupA.kind, 'redirect');
    if (lookupA.kind === 'redirect') {
      assert.equal(lookupA.targetSlug, slugB);
    }

    // Collision protection: m2 cannot claim m1's historical alias slugA
    await assert.rejects(
      () =>
        updateMinisiteFull({
          minisiteId: m2.id,
          title: m2.title,
          slug: slugA,
          templateId: m2.templateId,
          theme: m2.theme as Record<string, unknown>,
          seo: m2.seo as Record<string, unknown>,
          blocks: [],
          actorId,
        }),
      (err: unknown) => err instanceof SlugValidationError && err.status === 409
    );

    // Rename B -> C -> A (loop protection: reverting to A removes A from aliases and avoids A->C->A cycle)
    await updateMinisiteFull({
      minisiteId: m1.id,
      title: `${baseTitle} V2 Rascunho`,
      slug: slugC,
      templateId: m1.templateId,
      theme: m1.theme as Record<string, unknown>,
      seo: m1.seo as Record<string, unknown>,
      blocks: [],
      actorId,
    });
    await updateMinisiteFull({
      minisiteId: m1.id,
      title: `${baseTitle} V2 Rascunho`,
      slug: slugA,
      templateId: m1.templateId,
      theme: m1.theme as Record<string, unknown>,
      seo: m1.seo as Record<string, unknown>,
      blocks: [],
      actorId,
    });

    const aliasesAfterRevert = await listMinisiteSlugAliases(m1.id);
    assert.equal(aliasesAfterRevert.includes(slugA), false);
    assert.equal(aliasesAfterRevert.includes(slugB), true);
    assert.equal(aliasesAfterRevert.includes(slugC), true);

    const lookupAAgain = await resolvePublicMinisiteLookup(slugA, false);
    assert.equal(lookupAAgain.kind, 'found');
    const lookupBToA = await resolvePublicMinisiteLookup(slugB, false);
    assert.equal(lookupBToA.kind, 'redirect');
    if (lookupBToA.kind === 'redirect') {
      assert.equal(lookupBToA.targetSlug, slugA);
    }

    // Unpublish -> BOTH current slug AND historical aliases must return null / not_found (draft protection)
    await unpublishMinisite({ minisiteId: m1.id, nextStatus: 'rascunho', actorId });
    assert.equal(await getPublishedMinisiteBySlug(m1.slug, false), null);
    assert.equal((await resolvePublicMinisiteLookup(slugB, false)).kind, 'not_found');
    assert.equal((await resolvePublicMinisiteLookup(slugC, false)).kind, 'not_found');

    // Clean alias records explicitly in case cascade test needs verification
    await db.delete(minisiteSlugAliases).where(eq(minisiteSlugAliases.minisiteId, m1.id)).catch(() => {});

    // Durable mediaAssets persistence in PostgreSQL
    const mediaName = `test-${uniqueSuffix}.png`;
    await saveMediaAsset({
      filename: mediaName,
      mimeType: 'image/png',
      dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      sizeBytes: 68,
    });
    const storedAsset = await getMediaAssetByFilename(mediaName);
    assert.ok(storedAsset);
    assert.equal(storedAsset.mimeType, 'image/png');
    await db.delete(mediaAssets).where(eq(mediaAssets.filename, mediaName)).catch(() => {});
  } finally {
    for (const msId of createdMinisiteIds) {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, String(msId))).catch(() => {});
      await deleteMinisiteRecord({ minisiteId: msId, actorId: createdTempProfileId ?? 1 }).catch(() =>
        db.delete(minisites).where(eq(minisites.id, msId))
      );
    }
    if (createdBusinessId != null) {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, String(createdBusinessId))).catch(() => {});
      await db.delete(businesses).where(eq(businesses.id, createdBusinessId)).catch(() => {});
    }
    if (createdTempProfileId != null) {
      await db.delete(profiles).where(inArray(profiles.id, [createdTempProfileId])).catch(() => {});
    }
  }
});

test.after(async () => {
  await createPool().end().catch(() => {});
});

