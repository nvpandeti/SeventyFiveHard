import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { pb, hydrateAuth } from '../lib/pocketbase';
import type { AppUser } from '../types';
import { todayISO } from '../utils/date';

function buildUsernameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const normalized = local.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const base = normalized || 'user';
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}_${suffix}`;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate stored auth on mount and subscribe to future changes.
  useEffect(() => {
    let mounted = true;
    (async () => {
      await hydrateAuth();
      if (!mounted) return;
      const current = pb.authStore.record as AppUser | null | undefined;
      setUser(current ?? null);
      setLoading(false);
    })();

    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser((record as AppUser | null) ?? null);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await pb.collection('users').authWithPassword(email, password);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      const username = buildUsernameFromEmail(email);
      await pb.collection('users').create({
        email,
        username,
        password,
        passwordConfirm: password,
        name: name ?? email.split('@')[0],
        current_day: 1,
        start_date: todayISO(),
      });
      await pb.collection('users').authWithPassword(email, password);
    },
    [],
  );

  const signOut = useCallback(() => {
    pb.authStore.clear();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!pb.authStore.record) return;
    try {
      const fresh = await pb.collection('users').authRefresh();
      setUser((fresh.record as unknown as AppUser) ?? null);
    } catch {
      pb.authStore.clear();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signUp, signOut, refreshUser }),
    [user, loading, signIn, signUp, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
