import { createClient, processLock } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Database } from '@/types/database';

/**
 * Chunked SecureStore adapter — Supabase JWTs occasionally exceed the
 * 2048-byte SecureStore limit (will throw in Expo SDK 55+). We split the
 * payload across `<key>.0, <key>.1, ...` entries and store the chunk
 * count as `<key>.count`. Transparent to Supabase; tokens stay encrypted
 * at rest (which is the whole reason we use SecureStore over AsyncStorage).
 */
const CHUNK_SIZE = 1900;  // safe margin under 2048
const COUNT_SUFFIX = '.count';

const ExpoSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countRaw = await SecureStore.getItemAsync(`${key}${COUNT_SUFFIX}`);
      if (countRaw === null) {
        // Legacy single-blob path (or never set)
        return await SecureStore.getItemAsync(key);
      }
      const count = parseInt(countRaw, 10);
      if (!Number.isFinite(count) || count <= 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}.${i}`);
        if (part === null) return null; // corrupted set — fail safe
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // Clean up any legacy single-blob first so we don't leak old data
    await SecureStore.deleteItemAsync(key).catch(() => {});
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
    }
    await SecureStore.setItemAsync(`${key}${COUNT_SUFFIX}`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    const countRaw = await SecureStore.getItemAsync(`${key}${COUNT_SUFFIX}`).catch(() => null);
    if (countRaw !== null) {
      const count = parseInt(countRaw, 10);
      if (Number.isFinite(count) && count > 0) {
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
        }
      }
      await SecureStore.deleteItemAsync(`${key}${COUNT_SUFFIX}`).catch(() => {});
    }
  },
};

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // PKCE is required for the OAuth (Google/Facebook) code-exchange flow and
      // is the more secure default for native apps. supabase-js generates +
      // stores the code_verifier via the storage adapter above; the OAuth
      // callback then calls exchangeCodeForSession(code). Also hardens the
      // magic-link / password-reset links against interception.
      flowType: 'pkce',
      // CRITICAL on React Native: supabase-js defaults to a navigator.locks-based
      // lock for token refresh, which doesn't exist in RN. Without processLock,
      // an expired access token (1h) makes the *next* request trigger a refresh
      // that deadlocks → the request hangs → "Request timed out" on any WRITE
      // (food logging, workouts, etc.) after the app has been open a while.
      lock: processLock,
    },
  }
);

// Drive token auto-refresh by app foreground/background. supabase-js only runs
// its refresh timer while told the app is active; without this the access token
// silently expires in the background and the first write afterwards hangs.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
// Kick it off now (module loads while the app is in the foreground).
supabase.auth.startAutoRefresh();
