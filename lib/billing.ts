/**
 * Billing adapter — RevenueCat (wraps Google Play Billing and StoreKit behind
 * one API, and owns receipt validation, which must never be hand-rolled).
 *
 * ENV-GATED. Without EXPO_PUBLIC_REVENUECAT_ANDROID_KEY (or the iOS key on
 * iOS) the SDK is never configured: isConfigured() stays false and every call
 * below returns its "not configured" shape. That is a normal state, not an
 * error — the app must behave exactly as it did before billing existed.
 *
 * The SDK is lazy-required (same pattern as lib/branchReferral.ts): a binary
 * built before react-native-purchases was added has no native module, and a
 * top-level import would throw while this module is being evaluated — at app
 * start, before any error boundary exists.
 *
 * This module NEVER decides entitlement. It reports what the store said; the
 * decision to grant a tier belongs to the server (see lib/subscriptionManager).
 */
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

/**
 * Outcome of a purchase/restore. A user backing out of the Play sheet is
 * 'cancelled', NOT 'error' — callers must not show a failure alert for it.
 */
export type PurchaseResult =
  | { status: 'success'; productIds: string[]; entitlementIds: string[] }
  | { status: 'cancelled' }
  | { status: 'error'; message: string; code?: string };

const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

/** The key for the platform we're running on, or undefined when unset. */
function apiKey(): string | undefined {
  const key = Platform.OS === 'ios' ? IOS_KEY : Platform.OS === 'android' ? ANDROID_KEY : undefined;
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

let sdk: any = null;
let sdkLoadAttempted = false;
let configured = false;
let warnedOnce = false;

function loadSdk(): any {
  if (sdkLoadAttempted) return sdk;
  sdkLoadAttempted = true;
  try {
    sdk = require('react-native-purchases').default;
  } catch {
    sdk = null; // native module absent (Expo Go / pre-rebuild binary / web)
  }
  return sdk;
}

function warnNotConfigured(where: string) {
  if (!__DEV__ || warnedOnce) return;
  warnedOnce = true;
  console.log(`[billing] not configured (${where}) — no RevenueCat key or native module; billing disabled`);
}

/** True once RevenueCat has been configured with a real key. */
export function isConfigured(): boolean {
  return configured;
}

/**
 * Configure RevenueCat. Returns whether billing is live.
 * Safe + idempotent: no key, no native module, or an SDK throw all resolve to
 * false and leave the app in its pre-billing state.
 */
export async function initBilling(): Promise<boolean> {
  if (configured) return true;

  const key = apiKey();
  if (!key) {
    warnNotConfigured('no api key');
    return false;
  }

  const purchases = loadSdk();
  if (!purchases) {
    warnNotConfigured('native module missing');
    return false;
  }

  try {
    if (__DEV__ && purchases.LOG_LEVEL) {
      await purchases.setLogLevel(purchases.LOG_LEVEL.DEBUG);
    }
    // No appUserID here — identify() binds the Supabase user id once auth is
    // known. Configuring anonymously first means a logged-out browse of the
    // paywall still gets real prices.
    purchases.configure({ apiKey: key });
    configured = true;
    return true;
  } catch (e) {
    if (__DEV__) console.log('[billing] configure failed', e);
    configured = false;
    return false;
  }
}

/**
 * Bind the RevenueCat customer to the Supabase auth user id, so entitlement
 * follows the ACCOUNT rather than the device — and so the RevenueCat webhook
 * can resolve a row in public.profiles.
 *
 * The id must come from the auth session (useAuthStore / supabase.auth), never
 * from anything the UI can supply: it is the join key the server trusts.
 * Pass null on sign-out to drop back to an anonymous customer.
 */
export async function identify(userId: string | null): Promise<void> {
  if (!configured) return;
  const purchases = loadSdk();
  if (!purchases) return;
  try {
    if (userId) await purchases.logIn(userId);
    else await purchases.logOut();
  } catch (e) {
    if (__DEV__) console.log('[billing] identify failed', e);
  }
}

/** Packages in the current offering, for the paywall to display. [] when off. */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const purchases = loadSdk();
  if (!purchases) return [];
  try {
    const offerings = await purchases.getOfferings();
    return offerings?.current?.availablePackages ?? [];
  } catch (e) {
    if (__DEV__) console.log('[billing] getOfferings failed', e);
    return [];
  }
}

/** Localized store prices keyed by store product id. Empty when billing is off. */
export async function getPrices(): Promise<Record<string, string>> {
  const packages = await getOfferings();
  const out: Record<string, string> = {};
  for (const pkg of packages) {
    const id = pkg?.product?.identifier;
    const price = pkg?.product?.priceString;
    if (id && price) out[id] = price;
  }
  return out;
}

/**
 * Buy a package. `id` accepts either a RevenueCat package identifier or a
 * store product id (PRODUCT_IDS in subscriptionManager are product ids) —
 * whichever matches a package in the current offering. If neither does we
 * fall back to buying the product directly, so a missing/misnamed offering in
 * the dashboard is not a hard failure.
 */
export async function purchase(packageId: string): Promise<PurchaseResult> {
  if (!configured) return { status: 'error', message: 'Billing is not configured', code: 'NOT_CONFIGURED' };
  const purchases = loadSdk();
  if (!purchases) return { status: 'error', message: 'Billing is not available', code: 'NOT_CONFIGURED' };

  try {
    const packages = await getOfferings();
    const match = packages.find(
      (p) => p.identifier === packageId || p.product?.identifier === packageId,
    );
    const result = match
      ? await purchases.purchasePackage(match)
      : await purchases.purchaseProduct(packageId);
    return successFrom(result?.customerInfo);
  } catch (e) {
    return failureFrom(e);
  }
}

/** Restore purchases made on another device / after a reinstall. */
export async function restore(): Promise<PurchaseResult> {
  if (!configured) return { status: 'error', message: 'Billing is not configured', code: 'NOT_CONFIGURED' };
  const purchases = loadSdk();
  if (!purchases) return { status: 'error', message: 'Billing is not available', code: 'NOT_CONFIGURED' };

  try {
    const info: CustomerInfo = await purchases.restorePurchases();
    return successFrom(info);
  } catch (e) {
    return failureFrom(e);
  }
}

function activeProductIds(info: CustomerInfo | undefined): string[] {
  if (!info) return [];
  // activeSubscriptions carries store product ids; on Google Play a
  // subscription id can arrive suffixed with its base plan (`id:base-plan`),
  // so keep the bare id too or callers can never match PRODUCT_IDS.
  const ids = new Set<string>();
  for (const raw of info.activeSubscriptions ?? []) {
    if (!raw) continue;
    ids.add(raw);
    const colon = raw.indexOf(':');
    if (colon > 0) ids.add(raw.slice(0, colon));
  }
  return Array.from(ids);
}

function successFrom(info: CustomerInfo | undefined): PurchaseResult {
  return {
    status: 'success',
    productIds: activeProductIds(info),
    entitlementIds: Object.keys(info?.entitlements?.active ?? {}),
  };
}

/** A user backing out of the store sheet is a cancellation, never an error. */
function failureFrom(e: any): PurchaseResult {
  const code = e?.code != null ? String(e.code) : undefined;
  const readable = e?.userInfo?.readableErrorCode ?? e?.readableErrorCode;
  // '1' is PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR; userCancelled is the
  // older signal. Check every form — the shape differs across platforms.
  if (e?.userCancelled === true || code === '1' || readable === 'PURCHASE_CANCELLED') {
    return { status: 'cancelled' };
  }
  if (__DEV__) console.log('[billing] purchase/restore failed', e);
  return { status: 'error', message: e?.message ?? 'Purchase failed', code };
}
