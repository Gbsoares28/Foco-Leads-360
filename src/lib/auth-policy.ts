export const ALLOWED_ADMIN_EMAIL = 'gabrieltreinadordeanimais@gmail.com';
export const ALLOWED_ADMIN_PASSWORD = '100130';

export type LoginValidationResult =
  | { ok: true; normalizedEmail: string }
  | { ok: false; reason: 'empty_fields' | 'email_not_allowed' | 'invalid_password'; error: string };

export function normalizeAuthEmail(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase();
}

export function isAuthorizedAdminEmail(email: string | null | undefined): boolean {
  return normalizeAuthEmail(email) === ALLOWED_ADMIN_EMAIL;
}

export function validateAdminLoginAttempt(
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

  if (normalizedEmail !== ALLOWED_ADMIN_EMAIL) {
    return {
      ok: false,
      reason: 'email_not_allowed',
      error: 'Acesso bloqueado: este e-mail não está autorizado a acessar o sistema.',
    };
  }

  if (rawPassword !== ALLOWED_ADMIN_PASSWORD) {
    return {
      ok: false,
      reason: 'invalid_password',
      error: 'Senha incorreta. Tentativa de acesso bloqueada.',
    };
  }

  return { ok: true, normalizedEmail };
}

export function isAuthorizedFirebaseAccount(params: {
  email?: string | null;
  signInProvider?: string | null;
  providerIds?: string[];
}): { allowed: boolean; error?: string } {
  if (!isAuthorizedAdminEmail(params.email)) {
    return {
      allowed: false,
      error: 'Acesso bloqueado: apenas o e-mail autorizado pode acessar o sistema.',
    };
  }

  if (params.signInProvider && params.signInProvider !== 'password') {
    return {
      allowed: false,
      error: 'Acesso bloqueado: autenticação permitida apenas com e-mail e senha autorizados.',
    };
  }

  if (
    Array.isArray(params.providerIds) &&
    params.providerIds.length > 0 &&
    !params.providerIds.includes('password')
  ) {
    return {
      allowed: false,
      error: 'Acesso bloqueado: método de autenticação não autorizado.',
    };
  }

  return { allowed: true };
}
