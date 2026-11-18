import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedGoogleMapsUrl, safeResolveGoogleMapsLink } from '../src/lib/google-link-parser.ts';
import {
  BLOCK_CATALOG,
  enforceThemePaletteContrast,
  getBlockLabel,
  getBlockSummary,
  getContrastRatio,
  getDefaultPaletteForTemplate,
  mixHexColors,
} from '../src/lib/minisite-types.ts';
import { hasPermission, isValidRole } from '../src/lib/rbac.ts';
import {
  DEFAULT_COMMERCIAL_SCRIPTS,
  interpolateScriptVariables,
  SCRIPT_VARIABLES,
} from '../src/lib/default-scripts.ts';
import { formatGeminiError, isTransientGeminiError } from '../src/lib/gemini.ts';
import { normalizeSocialUrl } from '../src/components/SocialIcons.tsx';

test('RBAC: administrador has full permissions including official publication and team management', () => {
  assert.equal(isValidRole('administrador'), true);
  assert.equal(hasPermission('administrador', 'minisite:publish_official'), true);
  assert.equal(hasPermission('administrador', 'team:manage'), true);
  assert.equal(hasPermission('administrador', 'logs:read'), true);
});

test('RBAC: non-admin roles cannot authorize official publication or manage team', () => {
  assert.equal(hasPermission('gestor_comercial', 'minisite:publish_official'), false);
  assert.equal(hasPermission('gestor_comercial', 'team:manage'), false);
  assert.equal(hasPermission('consultor_comercial', 'minisite:create'), true);
  assert.equal(hasPermission('consultor_comercial', 'minisite:publish_official'), false);
  assert.equal(hasPermission('operacional', 'minisite:edit'), true);
  assert.equal(hasPermission('operacional', 'minisite:create'), false);
});

test('SSRF protection: blocks private/non-Google URLs and allows official Google Maps & share.google URLs', () => {
  assert.equal(isAllowedGoogleMapsUrl('http://127.0.0.1:3000/admin'), null);
  assert.equal(isAllowedGoogleMapsUrl('https://169.254.169.254/latest/meta-data'), null);
  assert.equal(isAllowedGoogleMapsUrl('https://evil.com/maps/place/Test'), null);
  assert.equal(isAllowedGoogleMapsUrl('https://www.google.com/search?q=test'), null);

  const validFull = isAllowedGoogleMapsUrl(
    'https://www.google.com/maps/place/Clinica+Veterinaria+Tijuca/@-22.9248,-43.2328,17z'
  );
  assert.notEqual(validFull, null);

  const validShort = isAllowedGoogleMapsUrl('https://maps.app.goo.gl/abc123');
  assert.notEqual(validShort, null);

  const validShareGoogle = isAllowedGoogleMapsUrl('https://share.google/AsPCFl25OzJd3df3m');
  assert.notEqual(validShareGoogle, null);

  const validResolvedSearch = isAllowedGoogleMapsUrl(
    'https://www.google.com/search?kgmid=/g/11yq1nccdg&hl=pt-BR&q=CAVET+-+Hospital+Veterin%C3%A1rio+Tijuca+24h'
  );
  assert.notEqual(validResolvedSearch, null);
});

test('Google link parser extracts place name and coordinates from full Google Maps URL', async () => {
  const result = await safeResolveGoogleMapsLink(
    'https://www.google.com/maps/place/Clinica+Veterinaria+Tijuca/@-22.9248,-43.2328,17z'
  );
  assert.equal(result.isUrl, true);
  assert.equal(result.validDomain, true);
  assert.equal(result.extractedName, 'Clinica Veterinaria Tijuca');
  assert.deepEqual(result.coordinates, { lat: -22.9248, lng: -43.2328 });
});

test('Google link parser extracts kgmid and query name from resolved share.google search URL', async () => {
  const result = await safeResolveGoogleMapsLink(
    'https://www.google.com/search?kgmid=/g/11yq1nccdg&hl=pt-BR&q=CAVET+-+Hospital+Veterin%C3%A1rio+Tijuca+24h'
  );
  assert.equal(result.isUrl, true);
  assert.equal(result.validDomain, true);
  assert.equal(result.extractedName, 'CAVET - Hospital Veterinário Tijuca 24h');
  assert.equal(result.kgmid, '/g/11yq1nccdg');
});

test('Google link parser handles plain business name + city input cleanly', async () => {
  const result = await safeResolveGoogleMapsLink('Barbearia Dom Pedro Botafogo');
  assert.equal(result.isUrl, false);
  assert.equal(result.extractedName, 'Barbearia Dom Pedro Botafogo');
});

test('Minisite palettes and block catalog return valid segment defaults and labels', () => {
  const vetPalette = getDefaultPaletteForTemplate('clinica_veterinaria');
  assert.match(vetPalette.theme.primaryColor, /^#[0-9a-fA-F]{6}$/);
  assert.match(vetPalette.theme.backgroundColor, /^#[0-9a-fA-F]{6}$/);

  const petPalette = getDefaultPaletteForTemplate('banho_e_tosa');
  assert.equal(petPalette.id, 'terracota_pet');

  assert.ok(BLOCK_CATALOG.length >= 12);
  assert.equal(getBlockLabel('produto_servico'), 'Produto / serviço');
  assert.equal(
    getBlockSummary({
      blockType: 'produto_servico',
      position: 0,
      visible: true,
      content: { name: 'Banho e Tosa' },
    }),
    'Banho e Tosa'
  );
});

test('Commercial scripts include all 8 stages and interpolate variables cleanly', () => {
  const distinctStages = new Set(DEFAULT_COMMERCIAL_SCRIPTS.map((s) => s.stageOrder));
  assert.equal(distinctStages.size, 8);
  assert.equal(DEFAULT_COMMERCIAL_SCRIPTS.length, 16);
  assert.ok(SCRIPT_VARIABLES.includes('{meu_nome}'));
  assert.ok(SCRIPT_VARIABLES.includes('{link_avaliacao}'));

  const rendered = interpolateScriptVariables(
    'Oi, aqui é {meu_nome} de {minha_cidade}. A {negocio} tem {avaliacoes} avaliações ({nota}) vs {concorrente} ({concorrente_avaliacoes}). Prévia: {link_site}',
    {
      meu_nome: 'Lucas',
      minha_cidade: 'Rio de Janeiro',
      negocio: 'Nosso Pet Favorito',
      avaliacoes: 42,
      nota: '4.9',
      concorrente: 'Pet Tijuca',
      concorrente_avaliacoes: 190,
      link_site: 'https://focoleads360.com.br/demo/nosso-pet',
    }
  );
  assert.match(rendered, /Lucas/);
  assert.match(rendered, /Nosso Pet Favorito/);
  assert.match(rendered, /190/);
  assert.doesNotMatch(rendered, /\{negocio\}/);
});

test('Palette contrast enforcement fixes low-contrast colors and derives serviceCardBg automatically', () => {
  const mixed = mixHexColors('#FFFFFF', '#C2410C', 0.14);
  assert.match(mixed, /^#[0-9A-F]{6}$/);

  const fixed = enforceThemePaletteContrast({
    primaryColor: '#FACC15',
    secondaryColor: '#C2410C',
    accentColor: '#EC4899',
    backgroundColor: '#FAF5ED',
    surfaceColor: '#FFFFFF',
    textColor: '#FAF5ED', // deliberately unreadable against background
    buttonTextColor: '#FFFFFF', // low contrast on bright yellow
  });

  assert.ok(getContrastRatio(fixed.textColor, fixed.backgroundColor) >= 4.5);
  assert.ok(getContrastRatio(fixed.buttonTextColor, fixed.primaryColor) >= 4.2);
  assert.match(fixed.serviceCardBg, /^#[0-9A-F]{6}$/);
});

test('Gemini error formatter detects transient 503 UNAVAILABLE errors and formats cleanly', () => {
  const raw503 = new Error(
    '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'
  );
  assert.equal(isTransientGeminiError(raw503), true);
  const formatted = formatGeminiError(raw503);
  assert.equal(formatted.status, 503);
  assert.doesNotMatch(formatted.message, /"status":"UNAVAILABLE"/);
  assert.match(formatted.message, /alta demanda/i);
});

test('Independent social button blocks and URL normalizer support Instagram, TikTok, YouTube, and Facebook', () => {
  for (const type of ['botao_instagram', 'botao_tiktok', 'botao_youtube', 'botao_facebook']) {
    assert.ok(BLOCK_CATALOG.some((b) => b.type === type), `Expected ${type} in BLOCK_CATALOG`);
  }
  assert.equal(normalizeSocialUrl('instagram', '@nossopetfavorito'), 'https://instagram.com/nossopetfavorito');
  assert.equal(normalizeSocialUrl('tiktok', '@nossopetfavorito'), 'https://tiktok.com/@nossopetfavorito');
  assert.equal(normalizeSocialUrl('youtube', '@feedemfoco360'), 'https://youtube.com/@feedemfoco360');
  assert.equal(normalizeSocialUrl('facebook', 'feedemfoco360'), 'https://facebook.com/feedemfoco360');
  assert.equal(
    normalizeSocialUrl('instagram', 'https://www.instagram.com/feedemfoco360/'),
    'https://www.instagram.com/feedemfoco360/'
  );
});
