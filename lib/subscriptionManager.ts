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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

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
const REFERRAL_UNTIL_KEY = 'referral_pro_until:v1';

const RANK: Record<Tier, number> = { free: 0, pro: 1, legend: 2 };

// `currentTier` is the BASE tier (paid / cached). The referral reward layers
// ON TOP: while referralProUntil is in the future, the effective tier is at
// least 'pro' — but never downgrades a paid Legend.
let currentTier: Tier = 'free';
let referralProUntil: number | null = null; // epoch ms, or null
const listeners: Set<TierListener> = new Set();

const DEV_TIER_OVERRIDE = __DEV__
  ? (process.env.EXPO_PUBLIC_DEV_TIER as Tier | undefined)
  : undefined;

// Founder comp accounts — these emails always resolve to LEGEND, in BOTH dev
// and release builds. This is the safe "unlock for me, not everyone" lever:
// it's keyed to specific accounts, so shipping it publicly grants nothing to
// regular users. Add/remove emails here. (Lowercase.)
const FOUNDER_EMAILS = new Set<string>([
  '9alley27@gmail.com',
  'madasales15@gmail.com',
]);

function isFounder(): boolean {
  try {
    const email = useAuthStore.getState().user?.email?.toLowerCase();
    return !!email && FOUNDER_EMAILS.has(email);
  } catch {
    return false;
  }
}

function referralActive(): boolean {
  return referralProUntil != null && Date.now() < referralProUntil;
}

/** The tier the user effectively has: base, elevated to LEGEND by an active
 *  referral reward (the Vanguard pass = Legend, earned at 3 referrals).
 *  Dev override always wins. */
function effectiveTier(): Tier {
  // Founder comp accounts → always LEGEND (works in release too).
  if (isFounder()) return 'legend';
  const base = DEV_TIER_OVERRIDE ?? currentTier;
  if (referralActive() && RANK[base] < RANK.legend) return 'legend';
  return base;
}

function notify() {
  const t = effectiveTier();
  listeners.forEach((cb) => { try { cb(t); } catch {} });
}

function setTier(tier: Tier) {
  if (tier === currentTier) return;
  currentTier = tier;
  AsyncStorage.setItem(CACHE_KEY, tier).catch(() => {});
  notify();
}

/**
 * Pull the server's referral reward state and apply it. The RPC both GRANTS
 * the reward (if the user just crossed 3 referrals) and returns pro_until, so
 * one call covers "grant + read". Cached locally for offline/instant boot.
 * Safe to call repeatedly + when logged out (returns no grant).
 */
export async function refreshReferralReward(): Promise<void> {
  try {
    const { data, error } = await (supabase.rpc as any)('claim_referral_reward');
    if (error || !data) return;
    const until = data.pro_until ? Date.parse(data.pro_until) : NaN;
    referralProUntil = Number.isFinite(until) ? until : null;
    if (referralProUntil) {
      AsyncStorage.setItem(REFERRAL_UNTIL_KEY, String(referralProUntil)).catch(() => {});
    } else {
      AsyncStorage.removeItem(REFERRAL_UNTIL_KEY).catch(() => {});
    }
    notify();
  } catch {
    // network/RPC failure — keep whatever (cached) state we have
  }
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
  // Feature gates resolve through the EFFECTIVE tier (base + referral reward).
  _setTierProvider(() => effectiveTier());

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

  // Load cached referral-reward expiry so the free month is honored instantly
  // on boot (even offline). refreshReferralReward() re-syncs from the server.
  try {
    const cachedUntil = await AsyncStorage.getItem(REFERRAL_UNTIL_KEY);
    if (cachedUntil) {
      const n = parseInt(cachedUntil, 10);
      if (Number.isFinite(n)) referralProUntil = n;
    }
  } catch {}

  // Best-effort server sync (grants if just earned; no-op when logged out).
  refreshReferralReward();

  // ── REAL BILLING GOES HERE (when an SDK-54-compatible lib is added) ──
  // e.g. connect to store, query active purchases, call setTier(resolveTier(ids)),
  //      register a purchase listener + AppState foreground re-validation.
}

export function getUserTier(): Tier {
  return effectiveTier();
}

/** True when the current Legend access comes from the referral reward (the
 *  Vanguard pass), not a paid plan — lets the UI label it accordingly. */
export function isReferralRewardActive(): boolean {
  return referralActive() && RANK[DEV_TIER_OVERRIDE ?? currentTier] < RANK.legend;
}

/** When the referral-reward Pro month expires (epoch ms), or null. */
export function getReferralProUntil(): number | null {
  return referralActive() ? referralProUntil : null;
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
