import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

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
  authError: string | null;
  isDemoSession: boolean;
  showDemoData: boolean;
  baseDomain: string;
  setShowDemoData: (value: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  enterDemoSession: () => void;
  logout: () => Promise<void>;
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [showDemoData, setShowDemoData] = useState(true);
  const [baseDomain, setBaseDomain] = useState('focoleads360.com.br');

  const syncProfile = useCallback(async (user: User) => {
    const token = await user.getIdToken();
    setIdToken(token);
    const res = await fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível validar sua conta.');
    }
    setProfile(data.profile);
    if (data.baseDomain) setBaseDomain(data.baseDomain);
    setIsDemoSession(false);
    setShowDemoData(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          setAuthError(null);
          await syncProfile(user);
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Falha na autenticação.');
          setProfile(null);
        }
      } else {
        setProfile(null);
        setIdToken(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [syncProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      setAuthError(null);
      const result = await signInWithPopup(auth, googleAuthProvider);
      await syncProfile(result.user);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao entrar com Google.';
      setAuthError(message);
    }
  }, [syncProfile]);

  const enterDemoSession = useCallback(() => {
    setAuthError(null);
    setIsDemoSession(true);
    setShowDemoData(true);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setIdToken(null);
    setIsDemoSession(false);
  }, []);

  const apiFetch = useCallback(
    async <T = unknown>(url: string, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers || {});
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }

      if (firebaseUser) {
        const freshToken = idToken || (await firebaseUser.getIdToken());
        headers.set('Authorization', `Bearer ${freshToken}`);
      } else if (isDemoSession) {
        headers.set('x-foco-demo-mode', 'true');
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 429 || json.code === 'GMP_QUOTA_EXCEEDED' || json.error?.status === 'RESOURCE_EXHAUSTED') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (!response.ok) {
        throw new Error(json.error || `Erro na requisição (${response.status}).`);
      }
      return json as T;
    },
    [firebaseUser, idToken, isDemoSession]
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authError,
        isDemoSession,
        showDemoData,
        baseDomain,
        setShowDemoData,
        signInWithGoogle,
        enterDemoSession,
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
