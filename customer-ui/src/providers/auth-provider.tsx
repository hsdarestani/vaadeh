'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getProfile, logoutWeb, refreshSession, verifyOtpWeb } from '@/src/lib/api-client';

type User = { id: string; mobile: string } | null;

interface AuthContextValue {
  user: User;
  loading: boolean;
  loginWithOtp: (mobile: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const profile = await getProfile();
      setUser({ id: profile.id, mobile: profile.mobile });
    } catch (err) {
      console.warn('session invalid', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile().catch(() => setLoading(false));
  }, []);

  const loginWithOtp = async (mobile: string, code: string) => {
    setLoading(true);
    await verifyOtpWeb(mobile, code);
    await fetchProfile();
  };

  const refresh = async () => {
    try {
      await refreshSession();
      await fetchProfile();
    } catch (err) {
      console.error('refresh failed', err);
      setUser(null);
    }
  };

  const logout = async () => {
    await logoutWeb();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, loginWithOtp, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
