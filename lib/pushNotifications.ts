/**
 * Push notification token registration.
 *
 * Call `registerPushTokenIfNeeded()` after the user logs in. We:
 *   1. Ask for permission (no-op if already granted)
 *   2. Get the Expo push token for this device
 *   3. Upsert it to Supabase (`upsert_push_token` RPC)
 *
 * Safe to call repeatedly — the RPC is idempotent and we short-circuit if
 * we already registered this session.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

let registeredThisSession = false;

/** Register/refresh this device's push token (idempotent Supabase RPC). */
async function upsertPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
  const { error } = await (supabase.rpc as any)('upsert_push_token', { p_token: token, p_platform: platform });
  if (error) throw error;
}

export async function registerPushTokenIfNeeded(): Promise<void> {
  if (registeredThisSession) return;

  try {
    // Permission flow (Android 13+ requires runtime grant)
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return;

    // Expo Push Token requires a projectId (from app.json -> extra.eas.projectId)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) {
      if (__DEV__) console.warn('[push] no EAS projectId — skipping registration');
      return;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token?.data) return;

    const platform: 'ios' | 'android' | 'web' =
      Platform.OS === 'ios' ? 'ios'
      : Platform.OS === 'android' ? 'android'
      : 'web';

    await upsertPushToken(token.data, platform);
    registeredThisSession = true;
    if (__DEV__) console.log('[push] registered token for territory alerts');
  } catch (err: any) {
    if (__DEV__) console.warn('[push] registration failed:', err?.message ?? err);
  }
}
