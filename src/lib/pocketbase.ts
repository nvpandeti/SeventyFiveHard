import PocketBase, { AsyncAuthStore } from 'pocketbase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PB_URL } from '../config';
import { debugError, debugLog } from './debug';

const STORAGE_KEY = 'pb_auth';

/**
 * PocketBase client with an AsyncStorage-backed auth store so users stay
 * signed in across app restarts.
 *
 * Call `hydrateAuth()` once at app start before rendering navigation so
 * the initial auth token is loaded from storage.
 */
const store = new AsyncAuthStore({
  save: async (serialized: string) => {
    debugLog('pocketbase', 'Persisting auth store', { bytes: serialized.length });
    await AsyncStorage.setItem(STORAGE_KEY, serialized);
  },
  clear: async () => {
    debugLog('pocketbase', 'Clearing persisted auth store');
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
});

export const pb = new PocketBase(PB_URL, store);
pb.autoCancellation(false);
debugLog('pocketbase', 'PocketBase client initialized', { baseUrl: PB_URL });

let hydrated = false;
export async function hydrateAuth(): Promise<void> {
  if (hydrated) {
    debugLog('pocketbase', 'Skipping auth hydration; already hydrated');
    return;
  }
  hydrated = true;
  debugLog('pocketbase', 'Hydrating auth store from AsyncStorage');
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      debugLog('pocketbase', 'Cached auth found', { bytes: raw.length });
      await store.save(raw);
    } else {
      debugLog('pocketbase', 'No cached auth found');
    }
  } catch (error) {
    debugError('pocketbase', 'Failed to hydrate cached auth', error);
    /* ignore malformed cached auth */
  }
}
