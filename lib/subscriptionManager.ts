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
 *   3. The SERVER's entitlement — get_my_entitlement() (migration 023), read by
 *      syncEntitlement() below. This is the ONLY thing that may grant a paid
 *      tier; the database is the source of truth and the AI edge functions read
 *      the same RPC.
 *   4. Referral reward (server-granted, elevates to Legend while active)
 *
 * AsyncStorage is a CACHE of the server's last answer, never an authority: it
 * exists so a cold or offline start isn't a downgrade. It can only ever repeat
 * what the server last said, and a cached paid tier dies at its own expiry
 * (see paidTier()) rather than living forever on a device that never syncs.
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

// ONE key holding {tier, until} together, deliberately not two.
//
// Two keys cannot be written atomically: AsyncStorage.setItem returns a promise
// we intentionally swallow, and the process can die between the two calls. Half
// a write in the dangerous direction — the tier lands, the expiry does not —
// leaves a cached paid tier with NO known expiry, which paidTier() then honours
// forever on a device that never syncs again. That is precisely the "a lapsed
// subscription survives indefinitely offline" failure the expiry check exists to
// prevent, so tier and expiry must land together or not at all.
//
// v2 because the v1 key held the tier alone; an old v1 value is ignored rather
// than migrated, which fails closed (a stale 'pro' with no expiry is exactly
// what must not be trusted — the next syncEntitlement() restores the real one).
const CACHE_KEY = 'subscription_entitlement:v2';
const REFERRAL_UNTIL_KEY = 'referral_pro_until:v1';

const RANK: Record<Tier, number> = { free: 0, pro: 1, legend: 2 };

// `currentTier` is the BASE tier — the PAID subscription the server last
// reported, cached for offline start-up. The referral reward layers ON TOP:
// while referralProUntil is in the future, the effective tier is at least
// 'pro' — but never downgrades a paid Legend.
let currentTier: Tier = 'free';
// When the cached paid tier stops being valid (epoch ms), or null for "no
// expiry" (a comp/lifetime grant — the server stores NULL for those).
let paidUntil: number | null = null;
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

/**
 * The paid tier we may act on: the server's last word, dropped to 'free' once
 * its known expiry has passed.
 *
 * The expiry check is what keeps the cache honest offline. Without it, a device
 * that stops syncing (airplane mode, revoked network, a user who force-quits
 * before every sync) would hold a paid tier forever on a subscription that
 * lapsed months ago. With it, the cache can bridge a flight but never outlive
 * the entitlement the server actually granted.
 */
function paidTier(): Tier {
  if (currentTier === 'free') return 'free';
  if (paidUntil != null && Date.now() >= paidUntil) return 'free';
  return currentTier;
}

/** The tier the user effectively has: base, elevated to LEGEND by an active
 *  referral reward (the Vanguard pass = Legend, earned at 3 referrals).
 *  Dev override always wins. */
function effectiveTier(): Tier {
  // Founder comp accounts → always LEGEND (works in release too).
  if (isFounder()) return 'legend';
  const base = DEV_TIER_OVERRIDE ?? paidTier();
  if (referralActive() && RANK[base] < RANK.legend) return 'legend';
  return base;
}

function notify() {
  const t = effectiveTier();
  listeners.forEach((cb) => { try { cb(t); } catch {} });
}

/**
 * Record the paid entitlement the SERVER reported and mirror it to the cache.
 * `until` is the moment it stops being valid, or null for no expiry.
 *
 * Every write here is downstream of an RPC response (or the __DEV__-only
 * applyTier switcher). Nothing derived from the device — owned product ids,
 * a restore result, a stored flag — may reach this function.
 */
function setEntitlement(tier: Tier, until: number | null) {
  if (tier === currentTier && until === paidUntil) return;
  currentTier = tier;
  paidUntil = until;
  // Single write, so the cache can never hold a tier without its expiry.
  // `until: null` is stored explicitly and means "no expiry" (comp/lifetime) —
  // only ever what the server itself reported.
  if (tier === 'free') AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
  else AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ tier, until })).catch(() => {});
  notify();
}

function setReferralUntil(until: number | null) {
  referralProUntil = until;
  if (until == null) AsyncStorage.removeItem(REFERRAL_UNTIL_KEY).catch(() => {});
  else AsyncStorage.setItem(REFERRAL_UNTIL_KEY, String(until)).catch(() => {});
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

/** ISO timestamp → epoch ms; null for anything absent or unparseable. */
function parseTs(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

/** Shape of get_my_entitlement(). Everything is `unknown` on purpose: this is
 *  parsed, never trusted to be well-formed. */
type EntitlementRow = {
  tier?: unknown;
  expires_at?: unknown;
  source?: unknown;
  referral_pro_until?: unknown;
};

/**
 * Apply one get_my_entitlement() response. The server's answer replaces local
 * state outright — this is the only function that may raise a paid tier.
 *
 * `row.tier` is the EFFECTIVE tier (paid subscription with the referral overlay
 * already applied), while `currentTier` here is the PAID BASE that
 * effectiveTier() re-applies the overlay to. `row.source` says which side won,
 * so the base is recovered from it rather than from the blended tier — keeping
 * isReferralRewardActive() able to tell a Vanguard pass from a paid Legend.
 */
function applyEntitlement(row: EntitlementRow): void {
  const tier: Tier = row.tier === 'pro' || row.tier === 'legend' ? row.tier : 'free';
  const expires = parseTs(row.expires_at);
  const source = typeof row.source === 'string' ? row.source : 'none';

  setReferralUntil(parseTs(row.referral_pro_until));

  if (source === 'subscription' || source === 'subscription+referral') {
    // A live paid subscription decided the tier, so the blended tier IS the
    // base. For 'subscription+referral' the server returns the LATER of the two
    // expiries; that is still safe to store as the paid expiry, because the
    // referral overlay grants the same Legend for exactly that extra stretch.
    setEntitlement(tier, expires);
  } else if (source === 'referral') {
    // The pass raised the tier on its own, so the server has told us the base
    // is NOT Legend (a live paid Legend would have reported
    // 'subscription+referral'). It does not say whether the base is 'free' or a
    // live 'pro', so: a cached Legend is provably dead and must go, while a
    // cached 'pro' is exactly the case we cannot distinguish and is left alone
    // — still subject to its own expiry in paidTier(). Either way the user has
    // Legend from the pass while this branch holds, so nothing unlocks or locks
    // right now; this only decides where they land when the pass lapses.
    if (currentTier === 'legend') setEntitlement('free', null);
  } else {
    // 'none' — no live paid subscription at all. Includes a signed-out or
    // unknown-profile caller, which the RPC answers as free.
    setEntitlement('free', null);
  }

  notify();
}

/**
 * Re-read entitlement from the SERVER and apply it. This is the app's single
 * entitlement sync point — every path that could change what a user may access
 * goes through here: boot (initBilling), every auth state change
 * (app/_layout.tsx), /referral, and after a purchase or restore. Keep it that
 * way; a second writer is a second thing to get wrong.
 *
 * Order matters, because step 1 is a WRITE the step-2 read must see:
 *   1. claim_referral_reward() (migration 022) — GRANTS a newly earned referral
 *      reward by stamping profiles.referral_pro_until. Its return value is
 *      deliberately ignored: it is a writer, not the authority.
 *   2. get_my_entitlement() (migration 023) — the authoritative READ. It takes
 *      identity from auth.uid(), resolves paid subscription + referral overlay
 *      server-side, and refuses to serve an expired tier.
 *
 * The paid seam is CLOSED as of migration 023: profiles.subscription_tier is
 * written only by apply_subscription_event() under the service role (the
 * provider webhooks), a trigger reverts any client attempt to write those
 * columns, and this RPC is the only way the app learns its tier. A patched
 * binary can still lie to itself about `currentTier`, but the AI edge functions
 * check the same RPC server-side, so forging it locally buys nothing that
 * costs money.
 *
 * FAILURE = KEEP THE CACHE. A network error, a signed-out session, or a
 * database that hasn't run 023 yet all return early, leaving the last known
 * entitlement in place. That is what stops a paying user losing their tier on a
 * plane — and paidTier() is what stops the cache outliving its expiry.
 */
export async function syncEntitlement(): Promise<void> {
  identifyBillingUser();

  // Grant-then-read. A failure here (offline, not signed in) must not skip the
  // read: the user may already hold a reward granted on an earlier run.
  try {
    await (supabase.rpc as any)('claim_referral_reward');
  } catch { /* best-effort writer */ }

  try {
    const { data, error } = await (supabase.rpc as any)('get_my_entitlement');
    if (error || !data || typeof data !== 'object') return;
    applyEntitlement(data as EntitlementRow);
  } catch {
    // network/RPC failure — keep whatever (cached) state we have
  }
}

/** @deprecated Name kept so existing callers (app/_layout.tsx, app/referral.tsx)
 *  don't change; this now syncs the whole entitlement, not just the referral. */
export const refreshReferralReward = syncEntitlement;

/**
 * Resolve tier from a set of owned product IDs. Used server-side reasoning
 * only — the RevenueCat webhook must apply this same mapping. Do not call it
 * with ids read from the device to set a tier: entitlement enters this module
 * through applyEntitlement() and nowhere else.
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

  // Load the cached copy of the server's last answer (instant, offline-safe).
  // Tier and expiry come out of the SAME record, so a paid tier can never be
  // restored without the expiry that limits it.
  //
  // A record whose expiry is missing or unparseable is treated as ALREADY
  // EXPIRED (paidUntil = 0), not as "no expiry": corrupt storage must not mint
  // a permanent tier. Only an explicit `null` — which is what the server means
  // by a comp/lifetime grant — is honoured as unlimited.
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { tier?: unknown; until?: unknown };
      if (cached.tier === 'pro' || cached.tier === 'legend') {
        currentTier = cached.tier;
        if (cached.until === null) paidUntil = null;
        else paidUntil = typeof cached.until === 'number' && Number.isFinite(cached.until)
          ? cached.until
          : 0;
      }
    }
  } catch {}

  // Load cached referral-reward expiry so the free month is honored instantly
  // on boot (even offline). syncEntitlement() re-syncs from the server.
  try {
    const cachedUntil = await AsyncStorage.getItem(REFERRAL_UNTIL_KEY);
    if (cachedUntil) {
      const n = parseInt(cachedUntil, 10);
      if (Number.isFinite(n)) referralProUntil = n;
    }
  } catch {}

  // Best-effort server sync — this is what turns the cache above into the
  // server's current word (grants a just-earned reward on the way).
  syncEntitlement();

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
  return referralActive() && RANK[DEV_TIER_OVERRIDE ?? paidTier()] < RANK.legend;
}

/** When the referral-reward Pro month expires (epoch ms), or null. */
export function getReferralProUntil(): number | null {
  return referralActive() ? referralProUntil : null;
}

/**
 * Start a purchase, reporting exactly what happened.
 *
 * A 'success' here means the STORE took the money — it does not mean a tier was
 * granted. Entitlement is applied only by the server sync below, so the unlock
 * lands once the provider's webhook has written it and syncEntitlement() has
 * read it back. If the webhook is still in flight the sync is a no-op and the
 * next one (auth change, next launch) picks it up. That is deliberate: better a
 * one-launch delay than a client-side unlock anyone can forge.
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
  await syncEntitlement();
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
  await syncEntitlement();
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
 * client state alone, which is exactly what syncEntitlement() exists to
 * prevent. It is also only cosmetic now — the AI edge functions check
 * get_my_entitlement() themselves, so a tier set here unlocks local UI and
 * nothing that costs money. Written with no expiry so the switcher sticks for
 * the session; the next server sync overwrites it.
 */
export function applyTier(tier: Tier): void {
  setEntitlement(tier, null);
}
