/**
 * Subscription Manager — tier resolution + cache.
 *
 * Purchases run through RevenueCat (lib/billing.ts), which wraps Google Play
 * Billing and StoreKit and owns receipt validation. Billing is ENV-GATED: with
 * no EXPO_PUBLIC_REVENUECAT_ANDROID_KEY the adapter never configures, every
 * function here keeps its pre-billing behaviour, and the paywall still shows
 * its "coming soon" path. A missing key can never crash or gate anything.
 *
 * We never link out to a web checkout for these plans — selling digital goods
 * through an external payment flow violates Google Play's Payments policy.
 *
 * Tier is resolved from:
 *   1. Founder allowlist (comp accounts)
 *   2. EXPO_PUBLIC_DEV_TIER (dev override for testing gated features)
 *   3. AsyncStorage cache (a tier the user previously had)
 *   4. Referral reward (server-granted, elevates to Legend while active)
 *
 * ⚠️ A PAID tier is NOT granted anywhere yet — see refreshReferralReward()
 * for the missing server-side entitlement writer. Purchases can be taken, but
 * nothing may unlock a tier until the server can vouch for it.
 *
 * Product IDs (register in Google Play Console + RevenueCat):
 *   atleato_pro_monthly     $9.99/mo
 *   atleato_pro_yearly      $101.90/yr  (15% off)
 *   atleato_legend_monthly  $19.99/mo
 *   atleato_legend_yearly   $191.90/yr  (20% off)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as billing from '@/lib/billing';
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

/**
 * Result of a purchase attempt. 'cancelled' is a user backing out of the store
 * sheet — it is NOT a failure and must not raise an error alert. 'unavailable'
 * means billing isn't configured (no key / no native module), which is the
 * paywall's existing "coming soon" path.
 */
export type PurchaseOutcome =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

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
 * Bind the RevenueCat customer to the signed-in Supabase user, so entitlement
 * follows the ACCOUNT not the device and the webhook can resolve a profile row.
 * The id comes from the auth session only — never from UI state. No-ops when
 * billing isn't configured.
 */
let lastIdentifiedUserId: string | null | undefined; // undefined = never synced

async function identifyBillingUser(): Promise<void> {
  const userId = useAuthStore.getState().user?.id ?? null;
  if (userId === lastIdentifiedUserId) return;
  try {
    await billing.identify(userId);
    lastIdentifiedUserId = userId;
  } catch {
    // never let identity binding break the caller; leave the marker unset so
    // the next auth change retries instead of assuming we're bound
  }
}

let watchingAuthForBilling = false;

/**
 * Keep the RevenueCat customer bound to whoever is signed in — including when
 * that is NOBODY.
 *
 * Sign-out matters as much as sign-in. app/_layout.tsx only syncs entitlement
 * on a session that HAS a user, so without this the SDK keeps the previous
 * account's appUserID after they log out. On a shared device the next person's
 * purchase — or their Restore Purchases — would then land on the account that
 * left. Only registered when billing is live, so an unconfigured build behaves
 * exactly as it did before.
 */
function watchAuthForBilling(): void {
  if (watchingAuthForBilling) return;
  watchingAuthForBilling = true;
  try {
    useAuthStore.subscribe(() => { identifyBillingUser(); });
  } catch {
    watchingAuthForBilling = false;
  }
}

/**
 * Re-read entitlement from the SERVER and apply it. This is the app's single
 * entitlement sync point: called on boot, on every auth state change
 * (app/_layout.tsx), from /referral, and after a purchase or restore.
 *
 * Today the server has exactly one entitlement writer: claim_referral_reward()
 * (migration 022). It both GRANTS the referral reward and returns pro_until,
 * so one call covers "grant + read". It knows nothing about purchases.
 *
 * ⚠️ MISSING SEAM — NO SERVER WRITER FOR A PURCHASED TIER.
 * A successful Play purchase currently unlocks nothing, because no server-side
 * signal exists to vouch for it. Do NOT close that gap on the client (i.e.
 * never `setTier(resolveTier(await billing.getActiveProductIds()))`): the ten
 * gates in lib/featureGates.ts are all that stand between a free user and every
 * paid feature, and a patched binary would then grant itself Legend.
 *
 * To close it, server-side:
 *   1. public.profiles gains paid_tier / paid_until / paid_provider /
 *      paid_txn_id (service_role writes only, mirroring 016_referral_reward).
 *   2. A `revenuecat-webhook` edge function verifies RevenueCat's Authorization
 *      header fail-closed, reads event.app_user_id (the id identifyBillingUser
 *      bound above) and writes those columns — same shape as
 *      lemonsqueezy-webhook, but keyed on auth.uid(), never on email.
 *   3. claim_referral_reward() (or a sibling RPC) also returns paid_tier, and
 *      the marked block below applies it via setTier().
 */
export async function refreshReferralReward(): Promise<void> {
  identifyBillingUser();
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

    // ── PAID TIER SEAM ──────────────────────────────────────────────────────
    // The only place a purchased tier may ever be applied — `data` here is the
    // server's word, not the client's. Unblock once step 3 above ships:
    //   const paid = data.paid_tier;
    //   const paidUntil = data.paid_until ? Date.parse(data.paid_until) : NaN;
    //   const live = Number.isFinite(paidUntil) && Date.now() < paidUntil;
    //   setTier(live && (paid === 'pro' || paid === 'legend') ? paid : 'free');
    // ────────────────────────────────────────────────────────────────────────

    notify();
  } catch {
    // network/RPC failure — keep whatever (cached) state we have
  }
}

/**
 * Resolve tier from a set of owned product IDs. Used server-side reasoning
 * only — the RevenueCat webhook must apply this same mapping. Do not call it
 * with ids read from the device to set a tier (see the seam below).
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

  // RevenueCat. Resolves false and changes nothing when no key is configured.
  await billing.initBilling();
  if (billing.isConfigured()) {
    await identifyBillingUser();
    watchAuthForBilling();
  }
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
 * Start a purchase, reporting exactly what happened.
 *
 * A 'success' here means the STORE took the money — it does not mean a tier was
 * granted. Entitlement is applied only by the server sync below (see the paid
 * tier seam in refreshReferralReward), so until that writer exists a paid user
 * stays on their current tier. That is deliberate: better a support ticket than
 * a client-side unlock anyone can forge.
 */
export async function startPurchase(productId: string): Promise<PurchaseOutcome> {
  if (!billing.isConfigured()) {
    if (__DEV__) console.warn('[subscription] purchases unavailable — RevenueCat not configured');
    return { status: 'unavailable' };
  }

  const result = await billing.purchase(productId);
  if (result.status === 'cancelled') return { status: 'cancelled' };
  if (result.status === 'error') return { status: 'error', message: result.message };

  // Purchase went through — ask the SERVER what the user is now entitled to.
  // RevenueCat's webhook is what writes it; this just re-reads.
  await refreshReferralReward();
  return { status: 'success' };
}

/**
 * Start a purchase. Kept for existing callers: true only when the store
 * completed the purchase. A cancellation and a not-configured build both
 * return false, so prefer startPurchase() when the caller needs to tell those
 * apart (a cancellation must not raise a failure alert).
 */
export async function purchaseSubscription(productId: string): Promise<boolean> {
  const outcome = await startPurchase(productId);
  return outcome.status === 'success';
}

/**
 * Restore previous purchases, then re-sync entitlement from the server.
 * No-ops when billing isn't configured — same as before.
 */
export async function restorePurchases(): Promise<void> {
  if (!billing.isConfigured()) return;
  const result = await billing.restore();
  if (result.status !== 'success') return;
  await refreshReferralReward();
}

export function addTierChangeListener(cb: TierListener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Localized store prices keyed by product id. Returns empty when billing isn't
 * configured — the paywall UI then falls back to its hardcoded display prices.
 */
export async function getProductPrices(): Promise<Record<string, string>> {
  return billing.getPrices();
}

/** Whether real in-app billing is live (key present + SDK configured). */
export function isBillingConfigured(): boolean {
  return billing.isConfigured();
}

/**
 * Manually set tier. DEV/ADMIN ONLY — the founder tier switcher in
 * app/profile.tsx is its sole caller and is __DEV__-gated.
 *
 * ⚠️ Must NEVER be reachable from a purchase path: it writes a paid tier from
 * client state alone, which is exactly what the server-authoritative seam in
 * refreshReferralReward() exists to prevent.
 */
export function applyTier(tier: Tier): void {
  setTier(tier);
}
