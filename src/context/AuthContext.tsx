import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { pb, hydrateAuth } from '../lib/pocketbase';
import { debugError, debugLog, debugWarn } from '../lib/debug';
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
    debugLog('auth', 'AuthProvider mounted; starting hydration');
    let mounted = true;
    (async () => {
      try {
        await hydrateAuth();
        if (!mounted) return;
        const current = pb.authStore.record as unknown as AppUser | null | undefined;
        setUser(current ?? null);
        debugLog('auth', 'Hydration complete', {
          userId: current?.id ?? null,
          signedIn: !!current,
        });
      } catch (error) {
        debugError('auth', 'Hydration failed', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    const unsubscribe = pb.authStore.onChange((_token, record) => {
      debugLog('auth', 'Auth store changed', {
        userId: (record as AppUser | null)?.id ?? null,
        signedIn: !!record,
      });
      setUser((record as AppUser | null) ?? null);
    });

    return () => {
      debugLog('auth', 'AuthProvider unmounted');
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim();
    debugLog('auth', 'Sign-in requested', { email: normalizedEmail });
    try {
      const result = await pb.collection('users').authWithPassword(normalizedEmail, password);
      debugLog('auth', 'Sign-in succeeded', {
        email: normalizedEmail,
        userId: result.record?.id,
      });
    } catch (error) {
      debugError('auth', 'Sign-in failed', error);
      throw error;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      const normalizedEmail = email.trim();
      const username = buildUsernameFromEmail(email);
      debugLog('auth', 'Sign-up requested', {
        email: normalizedEmail,
        hasName: !!name,
      });
      await pb.collection('users').create({
        email: normalizedEmail,
        username,
        password,
        passwordConfirm: password,
        name: name ?? normalizedEmail.split('@')[0],
        current_day: 1,
        start_date: todayISO(),
      });
      debugLog('auth', 'Sign-up record created', {
        email: normalizedEmail,
        username,
      });
      const result = await pb.collection('users').authWithPassword(normalizedEmail, password);
      debugLog('auth', 'Sign-up auto sign-in succeeded', {
        email: normalizedEmail,
        userId: result.record?.id,
      });
    },
    [],
  );

  const signOut = useCallback(() => {
    const record = pb.authStore.record as { id?: string } | null | undefined;
    debugLog('auth', 'Sign-out requested', {
      userId: record?.id ?? null,
    });
    pb.authStore.clear();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!pb.authStore.record) {
      debugWarn('auth', 'Skipping refreshUser; no active auth record');
      return;
    }
    debugLog('auth', 'Refreshing user from auth token', {
      userId: (pb.authStore.record as { id?: string } | null | undefined)?.id ?? null,
    });
    try {
      const fresh = await pb.collection('users').authRefresh();
      setUser((fresh.record as unknown as AppUser) ?? null);
      debugLog('auth', 'User refresh succeeded', {
        userId: fresh.record?.id,
      });
    } catch (error) {
      debugError('auth', 'User refresh failed; clearing auth store', error);
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
