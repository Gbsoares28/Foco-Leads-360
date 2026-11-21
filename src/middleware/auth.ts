import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateProfile, type ProfileRecord } from '../db/repositories.ts';
import { hasPermission, isValidRole, type Permission } from '../lib/rbac.ts';
import type { UserRole } from '../db/schema.ts';

import { isAuthorizedFirebaseAccount } from '../lib/auth-policy.ts';
import {
  ADMIN_SESSION_TOKEN_PREFIX,
  AdminSessionTokenError,
  verifyAdminSessionToken,
} from '../lib/admin-session.ts';

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  profile?: ProfileRecord;
  isDemoSession?: boolean;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Autenticação necessária. Faça login com o e-mail e senha autorizados.',
    });
  }

  const token = authHeader.split('Bearer ')[1];

  if (token.startsWith(ADMIN_SESSION_TOKEN_PREFIX)) {
    try {
      const session = verifyAdminSessionToken(token);
      const accessCheck = isAuthorizedFirebaseAccount({
        email: session.email,
        signInProvider: session.provider,
      });

      if (!accessCheck.allowed) {
        return res.status(403).json({
          error:
            accessCheck.error ||
            'Acesso bloqueado. Apenas o administrador autorizado pode acessar o sistema.',
        });
      }

      const profile = await getOrCreateProfile({
        uid: session.uid,
        email: session.email,
        fullName: 'Administrador Feed em Foco',
      });

      if (!profile.active) {
        return res.status(403).json({
          error: 'Sua conta interna está desativada. Contate o administrador.',
        });
      }

      req.profile = profile;
      next();
      return;
    } catch (error) {
      if (error instanceof AdminSessionTokenError) {
        if (error.code !== 'expired') {
          console.warn('Sessão de administrador rejeitada:', error.message);
        }
        return res.status(401).json({
          error: 'Sessão inválida ou expirada. Faça login novamente.',
          code: error.code === 'expired' ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
        });
      }
      console.error('Erro inesperado ao verificar sessão de administrador:', error);
      return res.status(401).json({
        error: 'Sessão inválida ou expirada. Faça login novamente.',
        code: 'SESSION_INVALID',
      });
    }
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const signInProvider =
      typeof decodedToken.firebase?.sign_in_provider === 'string'
        ? decodedToken.firebase.sign_in_provider
        : null;

    const accessCheck = isAuthorizedFirebaseAccount({
      email: decodedToken.email ?? null,
      signInProvider,
    });

    if (!accessCheck.allowed) {
      return res.status(403).json({
        error:
          accessCheck.error ||
          'Acesso bloqueado. Apenas o administrador autorizado pode acessar o sistema.',
      });
    }

    req.firebaseUser = decodedToken;

    const email = decodedToken.email ?? '';
    const fullName =
      decodedToken.name || (email ? email.split('@')[0] : 'Administrador Feed em Foco');

    const profile = await getOrCreateProfile({
      uid: decodedToken.uid,
      email,
      fullName,
    });

    if (!profile.active) {
      return res.status(403).json({
        error: 'Sua conta interna está desativada. Contate o administrador.',
      });
    }

    req.profile = profile;
    next();
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
    if (code === 'auth/id-token-expired' || code === 'auth/argument-error') {
      console.warn('Token Firebase expirado ou inválido:', code);
    } else {
      console.error('Erro ao verificar token Firebase:', error);
    }
    return res.status(401).json({
      error: 'Sessão inválida ou expirada. Faça login novamente.',
      code: code === 'auth/id-token-expired' ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
    });
  }
};

export const optionalAuthOrDemo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  return requireAuth(req, res, next);
};

export const requirePermission = (permission: Permission) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.profile) {
      return res.status(401).json({
        error: 'Ação permitida apenas para colaboradores autenticados.',
      });
    }
    const role: UserRole = isValidRole(req.profile.role)
      ? req.profile.role
      : 'consultor_comercial';

    if (!hasPermission(role, permission)) {
      return res.status(403).json({
        error: 'Você não possui permissão para executar esta operação.',
      });
    }
    next();
  };
};
