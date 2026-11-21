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

import {
  ALLOWED_ADMIN_EMAIL,
  isAuthorizedAdminEmail,
  isAuthorizedFirebaseAccount,
  validateAdminLoginAttempt,
} from '../src/lib/auth-policy.ts';
import {
  ADMIN_SESSION_TOKEN_PREFIX,
  AdminSessionTokenError,
  issueAdminSessionToken,
  verifyAdminCredentialsServer,
  verifyAdminSessionToken,
} from '../src/lib/admin-session.ts';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import crypto from 'node:crypto';
import { optionalAuthOrDemo, requireAuth } from '../src/middleware/auth.ts';

test('Auth policy allows only gabrieltreinadordeanimais@gmail.com with exact password 100130', () => {
  assert.equal(ALLOWED_ADMIN_EMAIL, 'gabrieltreinadordeanimais@gmail.com');
  assert.equal(isAuthorizedAdminEmail('  GabrielTreinadorDeAnimais@gmail.com '), true);
  assert.equal(isAuthorizedAdminEmail('outro@gmail.com'), false);
  assert.equal(isAuthorizedAdminEmail(''), false);

  const valid = validateAdminLoginAttempt('  GabrielTreinadorDeAnimais@gmail.com ', '100130');
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.normalizedEmail, 'gabrieltreinadordeanimais@gmail.com');
  }

  const wrongEmail = validateAdminLoginAttempt('intruder@gmail.com', '100130');
  assert.equal(wrongEmail.ok, false);
  if (!wrongEmail.ok) {
    assert.equal(wrongEmail.reason, 'email_not_allowed');
  }

  const wrongPassword = validateAdminLoginAttempt('gabrieltreinadordeanimais@gmail.com', '999999');
  assert.equal(wrongPassword.ok, false);
  if (!wrongPassword.ok) {
    assert.equal(wrongPassword.reason, 'invalid_password');
  }

  const emptyInput = validateAdminLoginAttempt('', '');
  assert.equal(emptyInput.ok, false);
  if (!emptyInput.ok) {
    assert.equal(emptyInput.reason, 'empty_fields');
  }
});

test('Auth policy blocks Google OAuth and unauthorized Firebase providers even for the admin email', () => {
  assert.equal(
    isAuthorizedFirebaseAccount({
      email: 'gabrieltreinadordeanimais@gmail.com',
      signInProvider: 'password',
      providerIds: ['password'],
    }).allowed,
    true
  );

  assert.equal(
    isAuthorizedFirebaseAccount({
      email: 'gabrieltreinadordeanimais@gmail.com',
      signInProvider: 'google.com',
      providerIds: ['google.com'],
    }).allowed,
    false
  );

  assert.equal(
    isAuthorizedFirebaseAccount({
      email: 'outro@gmail.com',
      signInProvider: 'password',
      providerIds: ['password'],
    }).allowed,
    false
  );
});

test('Server admin session verification and signed tokens allow only authorized admin and reject tampering', () => {
  const okCred = verifyAdminCredentialsServer('  GabrielTreinadorDeAnimais@gmail.com ', '100130');
  assert.equal(okCred.ok, true);

  const badEmail = verifyAdminCredentialsServer('outro@gmail.com', '100130');
  assert.equal(badEmail.ok, false);

  const badPass = verifyAdminCredentialsServer('gabrieltreinadordeanimais@gmail.com', '123456');
  assert.equal(badPass.ok, false);

  const token = issueAdminSessionToken(3600);
  assert.ok(token.startsWith('admin-session.'));

  const decoded = verifyAdminSessionToken(token);
  assert.equal(decoded.email, 'gabrieltreinadordeanimais@gmail.com');
  assert.equal(decoded.provider, 'password');

  // Tamper signature
  const tampered = `${token.slice(0, -4)}xxxx`;
  assert.throws(() => verifyAdminSessionToken(tampered));

  // Malformed prefix
  assert.throws(() => verifyAdminSessionToken('Bearer fake.token'));
});

test('Backend auth middleware blocks unauthenticated requests, tampered admin-session tokens, and x-foco-demo-mode bypass', async () => {
  const createMockRes = () => {
    const out: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
    return {
      out,
      res: {
        status(code: number) {
          out.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          out.body = payload;
          return this;
        },
      },
    };
  };

  let nextCalled = false;
  const mock1 = createMockRes();
  await requireAuth(
    { headers: {} } as never,
    mock1.res as never,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, false);
  assert.equal(mock1.out.statusCode, 401);

  const mock2 = createMockRes();
  await optionalAuthOrDemo(
    { headers: { 'x-foco-demo-mode': 'true' } } as never,
    mock2.res as never,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, false);
  assert.equal(mock2.out.statusCode, 401);

  const validToken = issueAdminSessionToken(3600);
  const tamperedToken = `${validToken.slice(0, -3)}abc`;
  const mock3 = createMockRes();
  await requireAuth(
    { headers: { authorization: `Bearer ${tamperedToken}` } } as never,
    mock3.res as never,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, false);
  assert.equal(mock3.out.statusCode, 401);

  // Build an expired admin session token signed with the active secret and ensure 401 SESSION_EXPIRED without console.error
  const secret =
    process.env.SESSION_SECRET?.trim() ||
    process.env.AUTH_TOKEN_SECRET?.trim() ||
    crypto
      .createHash('sha256')
      .update(`${firebaseConfig.projectId}:${firebaseConfig.apiKey}:foco-leads-360-admin-auth`)
      .digest('hex');
  const expiredPayloadB64 = Buffer.from(
    JSON.stringify({
      sub: 'admin-gabrieltreinadordeanimais',
      email: 'gabrieltreinadordeanimais@gmail.com',
      provider: 'password',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 60,
    }),
    'utf8'
  ).toString('base64url');
  const expiredSigB64 = crypto
    .createHmac('sha256', secret)
    .update(expiredPayloadB64)
    .digest('base64url');
  const expiredToken = `${ADMIN_SESSION_TOKEN_PREFIX}${expiredPayloadB64}.${expiredSigB64}`;

  assert.throws(
    () => verifyAdminSessionToken(expiredToken),
    (err: unknown) => err instanceof AdminSessionTokenError && err.code === 'expired'
  );

  const origConsoleError = console.error;
  let errorLogCalls = 0;
  console.error = () => {
    errorLogCalls += 1;
  };
  try {
    const mock4 = createMockRes();
    await requireAuth(
      { headers: { authorization: `Bearer ${expiredToken}` } } as never,
      mock4.res as never,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(mock4.out.statusCode, 401);
    assert.equal((mock4.out.body as { code?: string }).code, 'SESSION_EXPIRED');
    assert.equal(errorLogCalls, 0);
  } finally {
    console.error = origConsoleError;
  }
});


