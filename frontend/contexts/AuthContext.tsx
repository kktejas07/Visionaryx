import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  clearStoredToken,
  getStoredToken,
  publicApi,
  setStoredToken,
} from '@/lib/api';

export type UserMe = { id: number; email: string; role: string };

type AuthContextValue = {
  tokenReady: boolean;
  user: UserMe | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenReady, setTokenReady] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<UserMe>('/api/v1/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const t = await getStoredToken();
        if (!cancelled) setTokenReady(!!t);
        if (t) await refreshUser();
        else if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean = false) => {
    const r = await publicApi<{ access_token: string }>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, expires_in_days: rememberMe ? 30 : 1 }),
      },
      30_000,
    );
    // Persist token first, then load /me via the same `api()` path as the rest of the app
    // (avoids races between SecureStore and Bearer headers on some devices).
    await setStoredToken(r.access_token);
    setTokenReady(true);
    try {
      const me = await api<UserMe>('/api/v1/auth/me');
      setUser(me);
    } catch (e) {
      await clearStoredToken();
      setTokenReady(false);
      setUser(null);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await clearStoredToken();
    setTokenReady(false);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      tokenReady,
      user,
      loading,
      login,
      logout,
      refreshUser,
    }),
    [tokenReady, user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
