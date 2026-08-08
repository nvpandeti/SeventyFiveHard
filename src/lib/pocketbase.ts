import PocketBase, { AsyncAuthStore } from 'pocketbase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PB_URL } from '../config';

const STORAGE_KEY = 'pb_auth';

/**
 * PocketBase client with an AsyncStorage-backed auth store so users stay
 * signed in across app restarts.
 *
 * Call `hydrateAuth()` once at app start before rendering navigation so
 * the initial auth token is loaded from storage.
 */
const store = new AsyncAuthStore({
  save: async (serialized: string) => AsyncStorage.setItem(STORAGE_KEY, serialized),
  clear: async () => AsyncStorage.removeItem(STORAGE_KEY),
});

export const pb = new PocketBase(PB_URL, store);
pb.autoCancellation(false);

let hydrated = false;
export async function hydrateAuth(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      await store.save(raw);
    }
  } catch {
    /* ignore malformed cached auth */
  }
}
