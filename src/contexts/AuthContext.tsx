import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  isAuthorizedFirebaseAccount,
  validateAdminLoginAttempt,
} from '../lib/auth-policy';

export type UserRole =
  | 'administrador'
  | 'gestor_comercial'
  | 'consultor_comercial'
  | 'operacional';

export interface Profile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: Profile | null;
  loading: boolean;
  signingIn: boolean;
  authError: string | null;
  isDemoSession: boolean;
  showDemoData: boolean;
  baseDomain: string;
  setShowDemoData: (value: boolean) => void;
  signInWithCredentials: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ADMIN_SESSION_STORAGE_KEY = 'foco_admin_session_token';

function readStoredAdminSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveStoredAdminSessionToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, token);
  } catch {
    // ignore storage errors
  }
}

function clearStoredAdminSessionToken() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

function isAdminSessionTokenExpired(token: string, skewSeconds = 30): boolean {
  if (!token || !token.startsWith('admin-session.')) return true;
  const body = token.slice('admin-session.'.length);
  const parts = body.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return true;
  try {
    const base64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof decoded.exp !== 'number') return true;
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp <= now + skewSeconds;
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showDemoData, setShowDemoData] = useState(false);
  const [baseDomain, setBaseDomain] = useState('linkfoco.vercel.app');

  const syncProfile = useCallback(async (user: User) => {
    const providerIds = user.providerData.map((p) => p.providerId).filter(Boolean);
    const policyCheck = isAuthorizedFirebaseAccount({
      email: user.email,
      providerIds,
    });

    if (!policyCheck.allowed) {
      await signOut(auth).catch(() => undefined);
      throw new Error(policyCheck.error || 'Acesso bloqueado.');
    }

    const token = await user.getIdToken();
    clearStoredAdminSessionToken();
    setIdToken(token);
    const res = await fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      await signOut(auth).catch(() => undefined);
      throw new Error(data.error || 'Não foi possível validar sua conta.');
    }
    setProfile(data.profile);
    if (data.baseDomain) setBaseDomain(data.baseDomain);
    setShowDemoData(false);
  }, []);

  const restoreServerAdminSession = useCallback(async (): Promise<boolean> => {
    const storedToken = readStoredAdminSessionToken();
    if (!storedToken || isAdminSessionTokenExpired(storedToken)) {
      if (storedToken) {
        clearStoredAdminSessionToken();
      }
      return false;
    }

    try {
      const res = await fetch('/api/me', {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.profile) {
        clearStoredAdminSessionToken();
        return false;
      }
      const nextToken =
        typeof data.refreshedToken === 'string' && data.refreshedToken.startsWith('admin-session.')
          ? data.refreshedToken
          : storedToken;
      saveStoredAdminSessionToken(nextToken);
      setIdToken(nextToken);
      setProfile(data.profile);
      if (data.baseDomain) setBaseDomain(data.baseDomain);
      setShowDemoData(false);
      setAuthError(null);
      return true;
    } catch {
      return false;
    }
  }, []);

  const authenticateViaServerSession = useCallback(
    async (normalizedEmail: string, password: string): Promise<boolean> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token || !data?.profile) {
        throw new Error(data.error || 'Acesso bloqueado: credenciais não autorizadas.');
      }
      saveStoredAdminSessionToken(data.token);
      setIdToken(data.token);
      setProfile(data.profile);
      if (data.baseDomain) setBaseDomain(data.baseDomain);
      setShowDemoData(false);
      setAuthError(null);
      return true;
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const providerIds = user.providerData.map((p) => p.providerId).filter(Boolean);
        const policyCheck = isAuthorizedFirebaseAccount({
          email: user.email,
          providerIds,
        });

        if (!policyCheck.allowed) {
          await signOut(auth).catch(() => undefined);
          clearStoredAdminSessionToken();
          setFirebaseUser(null);
          setProfile(null);
          setIdToken(null);
          setAuthError(
            policyCheck.error || 'Acesso bloqueado: conta não autorizada.'
          );
          setLoading(false);
          return;
        }

        setFirebaseUser(user);
        try {
          setAuthError(null);
          await syncProfile(user);
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Falha na autenticação.');
          setFirebaseUser(null);
          setProfile(null);
          setIdToken(null);
        }
      } else {
        setFirebaseUser(null);
        const restored = await restoreServerAdminSession();
        if (!restored) {
          setProfile(null);
          setIdToken(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [restoreServerAdminSession, syncProfile]);

  const signInWithCredentials = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const validation = validateAdminLoginAttempt(email, password);
      if (!validation.ok) {
        setAuthError(validation.error);
        return false;
      }

      setSigningIn(true);
      setAuthError(null);
      try {
        return await authenticateViaServerSession(validation.normalizedEmail, password);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Falha na autenticação.');
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [authenticateViaServerSession]
  );

  const logout = useCallback(async () => {
    clearStoredAdminSessionToken();
    await signOut(auth).catch(() => undefined);
    setFirebaseUser(null);
    setProfile(null);
    setIdToken(null);
    setShowDemoData(false);
    setAuthError(null);
  }, []);

  const apiFetch = useCallback(
    async <T = unknown>(url: string, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers || {});
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }

      let activeToken = idToken;
      if (firebaseUser) {
        activeToken = await firebaseUser.getIdToken();
      } else {
        if (!activeToken) {
          activeToken = readStoredAdminSessionToken();
        }
        if (activeToken && activeToken.startsWith('admin-session.') && isAdminSessionTokenExpired(activeToken)) {
          clearStoredAdminSessionToken();
          setIdToken(null);
          setProfile(null);
          setAuthError('Sua sessão expirou. Faça login novamente.');
          throw new Error('Sessão expirada. Faça login novamente.');
        }
      }
      if (activeToken) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });
      const rawText = await response.text().catch(() => '');
      let json: Record<string, unknown> = {};
      let parseFailed = false;
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && typeof parsed === 'object') {
            json = parsed as Record<string, unknown>;
          } else {
            parseFailed = true;
          }
        } catch {
          parseFailed = true;
        }
      }
      const errObj = json.error as { status?: string } | string | undefined;
      if (
        response.status === 429 ||
        json.code === 'GMP_QUOTA_EXCEEDED' ||
        (typeof errObj === 'object' && errObj?.status === 'RESOURCE_EXHAUSTED')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (response.status === 401) {
        clearStoredAdminSessionToken();
        if (!firebaseUser) {
          setIdToken(null);
          setProfile(null);
          setAuthError('Sessão inválida ou expirada. Faça login novamente.');
        }
      }
      if (!response.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : `Erro na requisição (${response.status}).`;
        throw new Error(msg);
      }
      if (parseFailed || !rawText.trim()) {
        throw new Error('Resposta inválida do servidor ao processar a solicitação.');
      }
      return json as T;
    },
    [firebaseUser, idToken]
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        signingIn,
        authError,
        isDemoSession: false,
        showDemoData,
        baseDomain,
        setShowDemoData,
        signInWithCredentials,
        logout,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
