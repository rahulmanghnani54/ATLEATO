/**
 * Subscription Manager — tier resolution + cache.
 *
 * NATIVE BILLING IS CURRENTLY STUBBED.
 *
 * `expo-in-app-purchases` was removed because it does NOT compile on Expo
 * SDK 54 — it still imports the old `expo.modules.core.ExportedModule` /
 * `ExpoMethod` API that Expo deleted in SDK 52+. Keeping it broke the
 * Android build (`compileDebugJavaWithJavac` failure).
 *
 * This module keeps the SAME public API so every caller (paywall, feature
 * gates, profile) keeps working. Tier is resolved from:
 *   1. EXPO_PUBLIC_DEV_TIER (dev override for testing gated features)
 *   2. AsyncStorage cache (a tier the user previously had)
 *   3. Otherwise 'free'
 *
 * TO RE-ENABLE REAL PURCHASES (when ready):
 *   - Install an SDK-54-compatible IAP lib: `react-native-iap` or `expo-iap`
 *   - Implement connect / getProducts / purchase / restore inside the
 *     clearly-marked sections below
 *   - The product IDs + tier resolution logic are already here.
 *
 * Product IDs (register in Google Play Console):
 *   atleato_pro_monthly     $9.99/mo
 *   atleato_pro_yearly      $101.90/yr  (15% off)
 *   atleato_legend_monthly  $19.99/mo
 *   atleato_legend_yearly   $191.90/yr  (20% off)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { _setTierProvider } from '@/lib/featureGates';

export const PRODUCT_IDS = {
  PRO_MONTHLY:    'atleato_pro_monthly',
  PRO_YEARLY:     'atleato_pro_yearly',
  LEGEND_MONTHLY: 'atleato_legend_monthly',
  LEGEND_YEARLY:  'atleato_legend_yearly',
} as const;

export const ALL_PRODUCT_IDS = Object.values(PRODUCT_IDS);

type Tier = 'free' | 'pro' | 'legend';
type TierListener = (tier: Tier) => void;

const CACHE_KEY = 'subscription_tier:v1';

let currentTier: Tier = 'free';
const listeners: Set<TierListener> = new Set();

const DEV_TIER_OVERRIDE = __DEV__
  ? (process.env.EXPO_PUBLIC_DEV_TIER as Tier | undefined)
  : undefined;

function setTier(tier: Tier) {
  if (tier === currentTier) return;
  currentTier = tier;
  AsyncStorage.setItem(CACHE_KEY, tier).catch(() => {});
  listeners.forEach((cb) => { try { cb(tier); } catch {} });
}

/**
 * Resolve tier from a set of owned product IDs.
 * Kept for when a real IAP library is wired back in.
 */
export function resolveTier(ownedProductIds: string[]): Tier {
  const owned = new Set(ownedProductIds);
  if (owned.has(PRODUCT_IDS.LEGEND_MONTHLY) || owned.has(PRODUCT_IDS.LEGEND_YEARLY)) return 'legend';
  if (owned.has(PRODUCT_IDS.PRO_MONTHLY) || owned.has(PRODUCT_IDS.PRO_YEARLY)) return 'pro';
  return 'free';
}

export async function initBilling(): Promise<void> {
  _setTierProvider(() => currentTier);

  if (DEV_TIER_OVERRIDE) {
    console.log(`[subscription] DEV override → ${DEV_TIER_OVERRIDE}`);
    currentTier = DEV_TIER_OVERRIDE;
    return;
  }

  // Load any cached tier (instant, offline-safe)
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached === 'pro' || cached === 'legend') currentTier = cached;
  } catch {}

  // ── REAL BILLING GOES HERE (when an SDK-54-compatible lib is added) ──
  // e.g. connect to store, query active purchases, call setTier(resolveTier(ids)),
  //      register a purchase listener + AppState foreground re-validation.
}

export function getUserTier(): Tier {
  return DEV_TIER_OVERRIDE ?? currentTier;
}

/**
 * Start a purchase. Currently a no-op stub (no native billing module).
 * Returns false so the paywall shows its "not configured" path gracefully.
 */
export async function purchaseSubscription(_productId: string): Promise<boolean> {
  console.warn('[subscription] purchases unavailable — native billing not installed');
  return false;
}

/** Restore previous purchases. No-op until a real IAP lib is wired in. */
export async function restorePurchases(): Promise<void> {
  // No native billing — nothing to restore.
}

export function addTierChangeListener(cb: TierListener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Get formatted store prices. Returns empty without native billing — the
 * paywall UI falls back to its hardcoded display prices.
 */
export async function getProductPrices(): Promise<Record<string, string>> {
  return {};
}

/** Manually set tier (e.g. after a future web-checkout confirmation). */
export function applyTier(tier: Tier): void {
  setTier(tier);
}
