import crypto from 'crypto';
import {
  ALLOWED_ADMIN_EMAIL,
  normalizeAuthEmail,
  type LoginValidationResult,
} from './auth-policy.ts';

export const ADMIN_SESSION_TOKEN_PREFIX = 'admin-session.';
export const ADMIN_SESSION_UID = 'admin-gabrieltreinadordeanimais';
export const DEFAULT_ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias

export class AdminSessionTokenError extends Error {
  readonly code: 'expired' | 'invalid';

  constructor(message: string, code: 'expired' | 'invalid') {
    super(message);
    this.name = 'AdminSessionTokenError';
    this.code = code;
  }
}

export interface AdminSessionPayload {
  sub: string;
  email: string;
  provider: 'password';
  iat: number;
  exp: number;
}

function getAdminSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('Configure SESSION_SECRET no servidor com pelo menos 32 bytes aleatórios.');
  }
  return secret;
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyAdminCredentialsServer(
  email: string,
  password: string
): LoginValidationResult {
  const normalizedEmail = normalizeAuthEmail(email);
  const rawPassword = String(password ?? '');

  if (!normalizedEmail || !rawPassword) {
    return {
      ok: false,
      reason: 'empty_fields',
      error: 'Informe o e-mail e a senha de administrador para acessar.',
    };
  }

  if (!timingSafeTextEqual(normalizedEmail, ALLOWED_ADMIN_EMAIL)) {
    return {
      ok: false,
      reason: 'email_not_allowed',
      error: 'Acesso bloqueado: este e-mail não está autorizado a acessar o sistema.',
    };
  }

  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword || configuredPassword.length < 16) {
    throw new Error('Configure ADMIN_PASSWORD no servidor com pelo menos 16 caracteres.');
  }
  if (!timingSafeTextEqual(rawPassword, configuredPassword)) {
    return {
      ok: false,
      reason: 'invalid_password',
      error: 'Senha incorreta. Tentativa de acesso bloqueada.',
    };
  }

  return { ok: true, normalizedEmail };
}

export function issueAdminSessionToken(ttlSeconds = DEFAULT_ADMIN_SESSION_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    sub: ADMIN_SESSION_UID,
    email: ALLOWED_ADMIN_EMAIL,
    provider: 'password',
    iat: now,
    exp: now + Math.max(60, Math.floor(ttlSeconds)),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signatureB64 = crypto
    .createHmac('sha256', getAdminSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  return `${ADMIN_SESSION_TOKEN_PREFIX}${payloadB64}.${signatureB64}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload & { uid: string } {
  if (!token || !token.startsWith(ADMIN_SESSION_TOKEN_PREFIX)) {
    throw new AdminSessionTokenError('Token de sessão inválido.', 'invalid');
  }

  const body = token.slice(ADMIN_SESSION_TOKEN_PREFIX.length);
  const parts = body.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AdminSessionTokenError('Formato de token de sessão inválido.', 'invalid');
  }

  const [payloadB64, signatureB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getAdminSessionSecret())
    .update(payloadB64)
    .digest();

  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(signatureB64, 'base64url');
  } catch {
    throw new AdminSessionTokenError('Assinatura de sessão inválida.', 'invalid');
  }

  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    throw new AdminSessionTokenError('Assinatura de sessão inválida.', 'invalid');
  }

  let payload: Partial<AdminSessionPayload>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new AdminSessionTokenError('Conteúdo do token de sessão inválido.', 'invalid');
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub.trim() ||
    normalizeAuthEmail(payload.email) !== ALLOWED_ADMIN_EMAIL ||
    payload.provider !== 'password' ||
    typeof payload.exp !== 'number'
  ) {
    throw new AdminSessionTokenError('Sessão de administrador inválida.', 'invalid');
  }

  if (payload.exp <= now) {
    throw new AdminSessionTokenError('Sessão de administrador inválida ou expirada.', 'expired');
  }

  return {
    sub: payload.sub,
    uid: payload.sub,
    email: ALLOWED_ADMIN_EMAIL,
    provider: 'password',
    iat: typeof payload.iat === 'number' ? payload.iat : now,
    exp: payload.exp,
  };
}
