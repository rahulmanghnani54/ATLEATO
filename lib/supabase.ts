import { createClient } from '@supabase/supabase-js';
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
    },
  }
);
