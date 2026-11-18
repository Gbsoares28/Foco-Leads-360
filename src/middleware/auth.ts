import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateProfile, type ProfileRecord } from '../db/repositories.ts';
import { hasPermission, isValidRole, type Permission } from '../lib/rbac.ts';
import type { UserRole } from '../db/schema.ts';

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
    return res.status(401).json({ error: 'Autenticação necessária. Faça login com Google.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decodedToken;

    const email = decodedToken.email ?? '';
    const fullName =
      decodedToken.name || (email ? email.split('@')[0] : 'Colaborador Feed em Foco');

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
    console.error('Erro ao verificar token Firebase:', error);
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
};

export const optionalAuthOrDemo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }

  const demoHeader = req.headers['x-foco-demo-mode'];
  if (demoHeader === 'true') {
    req.isDemoSession = true;
    return next();
  }

  return res.status(401).json({
    error: 'Acesso restrito. Entre com sua conta ou ative o Modo Demonstração.',
  });
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
