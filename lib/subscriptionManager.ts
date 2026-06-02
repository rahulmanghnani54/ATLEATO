/**
 * Subscription Manager — expo-in-app-purchases billing client.
 *
 * Connects to Google Play Billing, resolves the user's active tier,
 * caches in AsyncStorage, re-validates on every app foreground.
 *
 * Product IDs (register in Google Play Console):
 *   atleato_pro_monthly     $9.99/mo
 *   atleato_pro_yearly      $101.90/yr  (15% off)
 *   atleato_legend_monthly  $19.99/mo
 *   atleato_legend_yearly   $191.90/yr  (20% off)
 */
import { AppState, AppStateStatus, Platform } from 'react-native';
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
let initialized = false;
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

function resolveTier(ownedProductIds: string[]): Tier {
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
    initialized = true;
    return;
  }

  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached === 'pro' || cached === 'legend') currentTier = cached;
  } catch {}

  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    initialized = true;
    return;
  }

  try {
    const IAP = require('expo-in-app-purchases');
    await IAP.connectAsync();
    initialized = true;

    const { results } = await IAP.getPurchaseHistoryAsync();
    if (results && results.length > 0) {
      const activeIds = results.filter((p: any) => p.acknowledged).map((p: any) => p.productId);
      setTier(resolveTier(activeIds));
    } else {
      setTier('free');
    }

    IAP.setPurchaseListener(({ responseCode, results: purchases }: any) => {
      if (responseCode === IAP.IAPResponseCode.OK && purchases) {
        for (const purchase of purchases) {
          IAP.finishTransactionAsync(purchase, false).catch(() => {});
        }
        setTier(resolveTier(purchases.map((p: any) => p.productId)));
      }
    });
  } catch (err) {
    console.warn('[subscription] billing init failed, defaulting to free:', err);
    initialized = true;
  }

  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && initialized) refreshPurchases().catch(() => {});
  });
}

async function refreshPurchases(): Promise<void> {
  if (DEV_TIER_OVERRIDE) return;
  try {
    const IAP = require('expo-in-app-purchases');
    const { results } = await IAP.getPurchaseHistoryAsync();
    if (results) {
      const activeIds = results.filter((p: any) => p.acknowledged).map((p: any) => p.productId);
      setTier(resolveTier(activeIds));
    }
  } catch {}
}

export function getUserTier(): Tier {
  return DEV_TIER_OVERRIDE ?? currentTier;
}

export async function purchaseSubscription(productId: string): Promise<boolean> {
  try {
    const IAP = require('expo-in-app-purchases');
    const { results } = await IAP.getProductsAsync([productId]);
    if (!results || results.length === 0) return false;
    await IAP.purchaseItemAsync(productId);
    return true;
  } catch (err: any) {
    if (err?.code === 'E_USER_CANCELLED') return false;
    console.warn('[subscription] purchase failed:', err);
    return false;
  }
}

export async function restorePurchases(): Promise<void> {
  await refreshPurchases();
}

export function addTierChangeListener(cb: TierListener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export async function getProductPrices(): Promise<Record<string, string>> {
  const prices: Record<string, string> = {};
  try {
    const IAP = require('expo-in-app-purchases');
    const { results } = await IAP.getProductsAsync(ALL_PRODUCT_IDS);
    if (results) {
      for (const product of results) prices[product.productId] = product.price;
    }
  } catch {}
  return prices;
}
