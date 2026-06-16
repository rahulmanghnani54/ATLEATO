# Paywall System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-tier subscription paywall (Free/Pro/Legend) with `expo-in-app-purchases`, feature gating, and a full-screen paywall modal.

**Architecture:** `subscriptionManager.ts` handles billing client + tier cache. `featureGates.ts` provides pure `canAccess(feature)` lookups. `paywall.tsx` is a full-screen modal route. Existing screens get gate checks on mount.

**Tech Stack:** expo-in-app-purchases, AsyncStorage, Expo Router, React Native

---

### Task 1: Install expo-in-app-purchases

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npx expo install expo-in-app-purchases
```

- [ ] **Step 2: Verify it installed**

```bash
cat package.json | grep "expo-in-app-purchases"
```

Expected: `"expo-in-app-purchases": "~X.Y.Z"`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install expo-in-app-purchases for paywall"
```

---

### Task 2: Create `lib/featureGates.ts`

**Files:**
- Create: `lib/featureGates.ts`

This is a pure lookup module with zero side effects. It reads tier from subscriptionManager (created in Task 3) but we design it first since it defines the contract.

- [ ] **Step 1: Create the feature gates module**

```typescript
// lib/featureGates.ts
/**
 * Feature Gating — pure lookup for which tier can access what.
 *
 * Usage:
 *   import { canAccess, getMaxCoaches, getRequiredTier } from '@/lib/featureGates';
 *
 *   if (!canAccess('ai_form_coach')) router.push('/paywall?feature=ai_form_coach');
 */

// Lazy import to avoid circular dependency — subscriptionManager imports nothing from here
let _getTier: () => 'free' | 'pro' | 'legend' = () => 'free';

/** Called once by subscriptionManager after it initializes */
export function _setTierProvider(fn: () => 'free' | 'pro' | 'legend') {
  _getTier = fn;
}

export type FeatureKey =
  | 'ai_form_coach'
  | 'reward_chests'
  | 'physique_photos'
  | 'custom_ringtone'
  | 'unlimited_freezes'
  | 'snooze_recalls'
  | 'territory_heatmap'
  | 'video_review'
  | 'voice_customization';

type Tier = 'free' | 'pro' | 'legend';

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  legend: 2,
};

const FEATURE_TIER: Record<FeatureKey, Tier> = {
  ai_form_coach:      'pro',
  reward_chests:       'pro',
  physique_photos:     'pro',
  custom_ringtone:     'pro',
  unlimited_freezes:   'pro',
  snooze_recalls:      'legend',
  territory_heatmap:   'legend',
  video_review:        'legend',
  voice_customization: 'legend',
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_form_coach:      'AI Form Coach',
  reward_chests:       'Reward Chests & Leaderboards',
  physique_photos:     'Physique Progress Photos',
  custom_ringtone:     'Custom Ringtone Picker',
  unlimited_freezes:   'Unlimited Streak Freezes',
  snooze_recalls:      '5-Min Snooze Re-Calls',
  territory_heatmap:   'Territory Heatmap & Analytics',
  video_review:        'Advanced Form AI & Video Review',
  voice_customization: 'Coach Voice Customization',
};

const COACH_LIMITS: Record<Tier, number> = {
  free: 1,
  pro: 3,
  legend: 5,
};

/** Check if the current user can access a gated feature */
export function canAccess(feature: FeatureKey): boolean {
  const userTier = _getTier();
  const requiredTier = FEATURE_TIER[feature];
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier];
}

/** How many coaches this user can select */
export function getMaxCoaches(): number {
  return COACH_LIMITS[_getTier()];
}

/** Minimum tier needed for a feature */
export function getRequiredTier(feature: FeatureKey): Tier {
  return FEATURE_TIER[feature];
}

/** Human-readable feature name for the paywall modal header */
export function getFeatureLabel(feature: FeatureKey): string {
  return FEATURE_LABELS[feature];
}

/** Current user tier — convenience re-export */
export function getUserTier(): Tier {
  return _getTier();
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/featureGates.ts
git commit -m "feat(paywall): add featureGates — pure tier→feature lookup"
```

---

### Task 3: Create `lib/subscriptionManager.ts`

**Files:**
- Create: `lib/subscriptionManager.ts`

- [ ] **Step 1: Create the subscription manager**

```typescript
// lib/subscriptionManager.ts
/**
 * Subscription Manager — expo-in-app-purchases billing client.
 *
 * Connects to Google Play Billing, resolves the user's active tier,
 * caches in AsyncStorage, re-validates on every app foreground.
 *
 * Product IDs (register these in Google Play Console):
 *   atleato_pro_monthly     $9.99/mo
 *   atleato_pro_yearly      $101.90/yr  (15% off)
 *   atleato_legend_monthly  $19.99/mo
 *   atleato_legend_yearly   $191.90/yr  (20% off)
 */
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { _setTierProvider } from '@/lib/featureGates';

// ── Product IDs ──
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

// ── In-memory state ──
let currentTier: Tier = 'free';
let initialized = false;
const listeners: Set<TierListener> = new Set();

// ── Dev override for testing ──
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
  if (owned.has(PRODUCT_IDS.LEGEND_MONTHLY) || owned.has(PRODUCT_IDS.LEGEND_YEARLY)) {
    return 'legend';
  }
  if (owned.has(PRODUCT_IDS.PRO_MONTHLY) || owned.has(PRODUCT_IDS.PRO_YEARLY)) {
    return 'pro';
  }
  return 'free';
}

/**
 * Initialize billing client. Call once in _layout.tsx on mount.
 * Safe to call multiple times — idempotent after first success.
 */
export async function initBilling(): Promise<void> {
  // Wire up the tier provider so featureGates can read our tier
  _setTierProvider(() => currentTier);

  // Dev override — skip real billing
  if (DEV_TIER_OVERRIDE) {
    console.log(`[subscription] DEV override → ${DEV_TIER_OVERRIDE}`);
    currentTier = DEV_TIER_OVERRIDE;
    initialized = true;
    return;
  }

  // Load cached tier immediately (instant UI, no billing latency)
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached === 'pro' || cached === 'legend') {
      currentTier = cached;
    }
  } catch {}

  // Connect to billing client
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    // Web or unsupported — stay free
    initialized = true;
    return;
  }

  try {
    const IAP = require('expo-in-app-purchases');
    await IAP.connectAsync();
    initialized = true;

    // Query active purchases
    const { results } = await IAP.getPurchaseHistoryAsync();
    if (results && results.length > 0) {
      const activeIds = results
        .filter((p: any) => p.acknowledged)
        .map((p: any) => p.productId);
      setTier(resolveTier(activeIds));
    } else {
      setTier('free');
    }

    // Listen for new purchases (user buys while app is open)
    IAP.setPurchaseListener(({ responseCode, results: purchases }: any) => {
      if (responseCode === IAP.IAPResponseCode.OK && purchases) {
        for (const purchase of purchases) {
          // Finish/acknowledge the transaction
          IAP.finishTransactionAsync(purchase, false).catch(() => {});
        }
        const ids = purchases.map((p: any) => p.productId);
        setTier(resolveTier(ids));
      }
    });
  } catch (err) {
    console.warn('[subscription] billing init failed, defaulting to free:', err);
    initialized = true;
  }

  // Re-validate on every foreground
  const handleAppState = (state: AppStateStatus) => {
    if (state === 'active' && initialized) {
      refreshPurchases().catch(() => {});
    }
  };
  AppState.addEventListener('change', handleAppState);
}

/** Re-query store for active purchases (called on foreground) */
async function refreshPurchases(): Promise<void> {
  if (DEV_TIER_OVERRIDE) return;
  try {
    const IAP = require('expo-in-app-purchases');
    const { results } = await IAP.getPurchaseHistoryAsync();
    if (results) {
      const activeIds = results
        .filter((p: any) => p.acknowledged)
        .map((p: any) => p.productId);
      setTier(resolveTier(activeIds));
    }
  } catch {}
}

/** Synchronous read — safe after initBilling resolves */
export function getUserTier(): Tier {
  return DEV_TIER_OVERRIDE ?? currentTier;
}

/** Initiate a purchase flow. Returns true on success. */
export async function purchaseSubscription(productId: string): Promise<boolean> {
  try {
    const IAP = require('expo-in-app-purchases');
    // Get product details first
    const { results } = await IAP.getProductsAsync([productId]);
    if (!results || results.length === 0) {
      console.warn('[subscription] product not found:', productId);
      return false;
    }
    // Launch purchase flow
    await IAP.purchaseItemAsync(productId);
    // The setPurchaseListener callback handles tier update
    return true;
  } catch (err: any) {
    if (err?.code === 'E_USER_CANCELLED') return false;
    console.warn('[subscription] purchase failed:', err);
    return false;
  }
}

/** Restore previous purchases (e.g., after reinstall) */
export async function restorePurchases(): Promise<void> {
  await refreshPurchases();
}

/** Subscribe to tier changes. Returns unsubscribe function. */
export function addTierChangeListener(cb: TierListener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Get formatted price strings for products (from store) */
export async function getProductPrices(): Promise<Record<string, string>> {
  const prices: Record<string, string> = {};
  try {
    const IAP = require('expo-in-app-purchases');
    const { results } = await IAP.getProductsAsync(ALL_PRODUCT_IDS);
    if (results) {
      for (const product of results) {
        prices[product.productId] = product.price;
      }
    }
  } catch {}
  return prices;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/subscriptionManager.ts
git commit -m "feat(paywall): add subscriptionManager — billing client + tier cache"
```

---

### Task 4: Create `app/paywall.tsx`

**Files:**
- Create: `app/paywall.tsx`

- [ ] **Step 1: Create the paywall modal screen**

```typescript
// app/paywall.tsx
/**
 * /paywall — Full-screen upgrade modal.
 *
 * Shows PRO and LEGEND tier cards with monthly/yearly toggle.
 * Yearly is pre-selected with SAVE badges (15% PRO, 20% LEGEND).
 * Optional ?feature= param customizes the header to "Unlock [Feature]".
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getFeatureLabel, type FeatureKey, getUserTier } from '@/lib/featureGates';
import {
  purchaseSubscription, restorePurchases, getProductPrices,
  PRODUCT_IDS,
} from '@/lib/subscriptionManager';

type Period = 'monthly' | 'yearly';

const FALLBACK_PRICES: Record<string, string> = {
  [PRODUCT_IDS.PRO_MONTHLY]:    '$9.99',
  [PRODUCT_IDS.PRO_YEARLY]:     '$101.90',
  [PRODUCT_IDS.LEGEND_MONTHLY]: '$19.99',
  [PRODUCT_IDS.LEGEND_YEARLY]:  '$191.90',
};

export default function PaywallScreen() {
  const router = useRouter();
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const [period, setPeriod] = useState<Period>('yearly');
  const [prices, setPrices] = useState(FALLBACK_PRICES);
  const [loading, setLoading] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getProductPrices().then((p) => {
      if (Object.keys(p).length > 0) setPrices(p);
    });
  }, []);

  const featureLabel = feature
    ? getFeatureLabel(feature as FeatureKey)
    : null;

  const header = featureLabel
    ? `Unlock ${featureLabel}`
    : 'Upgrade Your Plan';

  const proId = period === 'yearly' ? PRODUCT_IDS.PRO_YEARLY : PRODUCT_IDS.PRO_MONTHLY;
  const legendId = period === 'yearly' ? PRODUCT_IDS.LEGEND_YEARLY : PRODUCT_IDS.LEGEND_MONTHLY;

  const handlePurchase = async (productId: string) => {
    setLoading(productId);
    const success = await purchaseSubscription(productId);
    setLoading(null);
    if (success) {
      router.back();
    } else {
      // User cancelled or error — purchaseSubscription already logs
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    await restorePurchases();
    setRestoring(false);
    const tier = getUserTier();
    if (tier !== 'free') {
      Alert.alert('Restored!', `Your ${tier.toUpperCase()} subscription has been restored.`);
      router.back();
    } else {
      Alert.alert('No Subscription Found', 'We couldn\'t find an active subscription for this account.');
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.header}>{header}</Text>
        <Text style={s.subheader}>Train under legends. Unlock everything.</Text>

        {/* Period Toggle */}
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, period === 'monthly' && s.toggleActive]}
            onPress={() => setPeriod('monthly')}
          >
            <Text style={[s.toggleText, period === 'monthly' && s.toggleTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, period === 'yearly' && s.toggleActive]}
            onPress={() => setPeriod('yearly')}
          >
            <Text style={[s.toggleText, period === 'yearly' && s.toggleTextActive]}>
              Yearly
            </Text>
            <View style={s.saveBadge}>
              <Text style={s.saveBadgeText}>SAVE 20%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* PRO Card */}
        <View style={s.card}>
          <Text style={s.tierName}>PRO</Text>
          <Text style={s.price}>{prices[proId]}</Text>
          <Text style={s.pricePeriod}>
            {period === 'yearly' ? '/year ($8.49/mo)' : '/month'}
          </Text>
          {period === 'yearly' && (
            <View style={[s.saveBadgeInline, { backgroundColor: 'rgba(255,107,53,0.15)' }]}>
              <Text style={[s.saveBadgeText, { color: '#ff6b35' }]}>SAVE 15%</Text>
            </View>
          )}
          <View style={s.featureList}>
            <Text style={s.featureItem}>✓  3 Legend Coaches</Text>
            <Text style={s.featureItem}>✓  AI Form Correction (Live)</Text>
            <Text style={s.featureItem}>✓  Reward Chests + Leaderboards</Text>
            <Text style={s.featureItem}>✓  Physique Progress Photos</Text>
            <Text style={s.featureItem}>✓  Custom Ringtone Picker</Text>
            <Text style={s.featureItem}>✓  Unlimited Streak Freezes</Text>
          </View>
          <TouchableOpacity
            style={s.subscribeBtn}
            onPress={() => handlePurchase(proId)}
            disabled={!!loading}
          >
            {loading === proId ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <Text style={s.subscribeBtnText}>SUBSCRIBE TO PRO</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* LEGEND Card */}
        <View style={[s.card, s.cardLegend]}>
          <View style={s.recommendedBadge}>
            <Text style={s.recommendedText}>RECOMMENDED</Text>
          </View>
          <Text style={s.tierName}>LEGEND</Text>
          <Text style={s.price}>{prices[legendId]}</Text>
          <Text style={s.pricePeriod}>
            {period === 'yearly' ? '/year ($15.99/mo)' : '/month'}
          </Text>
          {period === 'yearly' && (
            <View style={[s.saveBadgeInline, { backgroundColor: 'rgba(223,255,31,0.15)' }]}>
              <Text style={[s.saveBadgeText, { color: '#dfff1f' }]}>SAVE 20%</Text>
            </View>
          )}
          <View style={s.featureList}>
            <Text style={s.featureItem}>✓  All 5 Legend Coaches</Text>
            <Text style={s.featureItem}>✓  Everything in PRO</Text>
            <Text style={s.featureItem}>✓  5-Min Snooze Re-Calls</Text>
            <Text style={s.featureItem}>✓  Territory Heatmap + Analytics</Text>
            <Text style={s.featureItem}>✓  Advanced Form AI + Video Review</Text>
            <Text style={s.featureItem}>✓  Coach Voice Customization</Text>
          </View>
          <TouchableOpacity
            style={[s.subscribeBtn, s.subscribeBtnLegend]}
            onPress={() => handlePurchase(legendId)}
            disabled={!!loading}
          >
            {loading === legendId ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <Text style={s.subscribeBtnText}>SUBSCRIBE TO LEGEND</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Restore */}
        <TouchableOpacity style={s.restoreBtn} onPress={handleRestore} disabled={restoring}>
          <Text style={s.restoreText}>
            {restoring ? 'Restoring...' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>

        <Text style={s.legal}>
          Payment will be charged to your Google Play account. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: 60 },
  closeBtn: {
    position: 'absolute', top: 52, right: 20, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.raised, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: Colors.textSecondary, fontSize: 18 },
  header: {
    fontFamily: Fonts.display, fontSize: 28, color: Colors.text,
    marginTop: 20, marginBottom: 6,
  },
  subheader: {
    fontSize: 15, color: Colors.textSecondary, marginBottom: 28,
  },
  toggleRow: {
    flexDirection: 'row', gap: 10, marginBottom: 24,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleActive: {
    borderColor: Colors.primary, backgroundColor: 'rgba(223,255,31,0.08)',
  },
  toggleText: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.textSecondary },
  toggleTextActive: { color: Colors.primary },
  saveBadge: {
    position: 'absolute', top: -8, right: -4,
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  saveBadgeText: {
    fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.5,
    color: Colors.bg, fontWeight: '700',
  },
  saveBadgeInline: {
    alignSelf: 'flex-start', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 8,
  },
  card: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 24, marginBottom: 16,
    backgroundColor: Colors.surface,
  },
  cardLegend: {
    borderColor: 'rgba(223,255,31,0.35)',
    backgroundColor: 'rgba(223,255,31,0.03)',
  },
  recommendedBadge: {
    position: 'absolute', top: -11, alignSelf: 'center',
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 4, left: '30%',
  },
  recommendedText: {
    fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5,
    color: Colors.bg, fontWeight: '700',
  },
  tierName: {
    fontFamily: Fonts.display, fontSize: 18, color: Colors.text,
    letterSpacing: 2, marginBottom: 8,
  },
  price: { fontFamily: Fonts.display, fontSize: 36, color: Colors.text },
  pricePeriod: { fontSize: 13, color: Colors.textTertiary, marginBottom: 4 },
  featureList: { marginTop: 18, gap: 10 },
  featureItem: { fontSize: 14, color: Colors.textSecondary },
  subscribeBtn: {
    marginTop: 20, backgroundColor: '#ff6b35', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center',
  },
  subscribeBtnLegend: { backgroundColor: Colors.primary },
  subscribeBtnText: {
    fontFamily: Fonts.display, fontSize: 13, letterSpacing: 1.2,
    color: Colors.bg,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: 16 },
  restoreText: { fontSize: 14, color: Colors.textTertiary, textDecorationLine: 'underline' },
  legal: {
    fontSize: 11, color: Colors.textTertiary, textAlign: 'center',
    lineHeight: 16, marginTop: 8,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/paywall.tsx
git commit -m "feat(paywall): add paywall modal — tier cards, toggle, purchase flow"
```

---

### Task 5: Wire billing init into `app/_layout.tsx`

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add import at the top of `_layout.tsx`**

Add this import alongside the existing ones (after line 33):

```typescript
import { initBilling } from '@/lib/subscriptionManager';
```

- [ ] **Step 2: Add initBilling() call inside the existing setup useEffect**

In the `useEffect` at line 75 that does `setupAndroidChannels`, `setupCallChannel`, etc., add one more try/catch block after the CallKeep setup (after line 104):

```typescript
      // Billing — resolve subscription tier from Google Play
      try { await initBilling(); } catch { /* ignore */ }
```

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(paywall): wire initBilling into root layout startup"
```

---

### Task 6: Gate `form-coach.tsx` (PRO)

**Files:**
- Modify: `app/form-coach.tsx`

- [ ] **Step 1: Add gate check at the top of the component**

Add import after existing imports:

```typescript
import { canAccess } from '@/lib/featureGates';
```

Add this check as the first thing inside the component function body (after the existing hooks):

```typescript
  // PRO feature gate
  useEffect(() => {
    if (!canAccess('ai_form_coach')) {
      router.replace('/paywall?feature=ai_form_coach' as any);
    }
  }, []);
```

- [ ] **Step 2: Commit**

```bash
git add app/form-coach.tsx
git commit -m "feat(paywall): gate AI form coach behind PRO tier"
```

---

### Task 7: Gate `physique-checkin.tsx` (PRO)

**Files:**
- Modify: `app/physique-checkin.tsx`

- [ ] **Step 1: Add gate check**

Add import:

```typescript
import { canAccess } from '@/lib/featureGates';
```

Add inside the component function, after the existing hooks:

```typescript
  useEffect(() => {
    if (!canAccess('physique_photos')) {
      router.replace('/paywall?feature=physique_photos' as any);
    }
  }, []);
```

- [ ] **Step 2: Commit**

```bash
git add app/physique-checkin.tsx
git commit -m "feat(paywall): gate physique check-in behind PRO tier"
```

---

### Task 8: Gate `ringtone-picker.tsx` (PRO)

**Files:**
- Modify: `app/ringtone-picker.tsx`

- [ ] **Step 1: Add gate check**

Add import:

```typescript
import { canAccess } from '@/lib/featureGates';
```

Add inside the component, after existing hooks:

```typescript
  useEffect(() => {
    if (!canAccess('custom_ringtone')) {
      router.replace('/paywall?feature=custom_ringtone' as any);
    }
  }, []);
```

- [ ] **Step 2: Commit**

```bash
git add app/ringtone-picker.tsx
git commit -m "feat(paywall): gate ringtone picker behind PRO tier"
```

---

### Task 9: Gate `leaderboard.tsx` (PRO)

**Files:**
- Modify: `app/leaderboard.tsx`

- [ ] **Step 1: Add gate check**

Add import:

```typescript
import { canAccess } from '@/lib/featureGates';
```

Add inside the component, after existing hooks:

```typescript
  useEffect(() => {
    if (!canAccess('reward_chests')) {
      router.replace('/paywall?feature=reward_chests' as any);
    }
  }, []);
```

- [ ] **Step 2: Commit**

```bash
git add app/leaderboard.tsx
git commit -m "feat(paywall): gate leaderboard behind PRO tier"
```

---

### Task 10: Gate streak freezes in `lib/streakFreezes.ts` (PRO = unlimited)

**Files:**
- Modify: `lib/streakFreezes.ts`

- [ ] **Step 1: Add tier-aware freeze limit**

Add import at the top:

```typescript
import { canAccess } from '@/lib/featureGates';
```

Find the existing `MAX_FREEZES` constant (line 28):

```typescript
export const MAX_FREEZES         = 3;
```

Change it to a function and add a monthly limit for free users:

```typescript
export const MAX_FREEZES_PRO     = 3;
export const MAX_FREEZES_FREE    = 1;

/** Max freezes the user can hold based on tier */
export function getMaxFreezes(): number {
  return canAccess('unlimited_freezes') ? MAX_FREEZES_PRO : MAX_FREEZES_FREE;
}
```

Then find every reference to `MAX_FREEZES` in this file and replace with `getMaxFreezes()`. There should be usages in the `awardFreezeIfEligible` and any cap-check functions.

- [ ] **Step 2: Commit**

```bash
git add lib/streakFreezes.ts
git commit -m "feat(paywall): limit streak freezes for free tier (1 vs unlimited)"
```

---

### Task 11: Gate snooze re-calls in `app/incoming-call.tsx` (LEGEND)

**Files:**
- Modify: `app/incoming-call.tsx`

- [ ] **Step 1: Add gate check for snooze**

Add import:

```typescript
import { canAccess } from '@/lib/featureGates';
```

Find the `handleDecline` function (around line 82). The snooze scheduling block currently reads:

```typescript
    if (kind === 'wakeup') {
      await scheduleSnoozeCall({ persona: personaId, minutes: 5 });
    }
```

Wrap it with a tier check:

```typescript
    if (kind === 'wakeup' && canAccess('snooze_recalls')) {
      await scheduleSnoozeCall({ persona: personaId, minutes: 5 });
    }
```

- [ ] **Step 2: Commit**

```bash
git add app/incoming-call.tsx
git commit -m "feat(paywall): gate 5-min snooze re-calls behind LEGEND tier"
```

---

### Task 12: Add upgrade button to profile screen

**Files:**
- Modify: `app/profile.tsx`

- [ ] **Step 1: Read the current profile screen to find where to add the upgrade row**

Check the existing profile.tsx structure — add a tier badge and "Upgrade" button at the top of the profile settings list.

Add imports:

```typescript
import { getUserTier } from '@/lib/featureGates';
```

Add a row near the top of the profile content (after the user info section):

```typescript
        {/* Subscription Tier */}
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: Colors.surface, borderRadius: 12,
            padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
          }}
          onPress={() => router.push('/paywall' as any)}
        >
          <View>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.5 }}>
              CURRENT PLAN
            </Text>
            <Text style={{ fontFamily: Fonts.display, fontSize: 18, color: Colors.primary, marginTop: 4 }}>
              {getUserTier().toUpperCase()}
            </Text>
          </View>
          {getUserTier() !== 'legend' && (
            <View style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ fontFamily: Fonts.display, fontSize: 11, color: Colors.bg, letterSpacing: 1 }}>
                UPGRADE
              </Text>
            </View>
          )}
        </TouchableOpacity>
```

- [ ] **Step 2: Commit**

```bash
git add app/profile.tsx
git commit -m "feat(paywall): add tier badge + upgrade button to profile screen"
```

---

### Task 13: Final integration test

- [ ] **Step 1: Test dev tier override**

Add to `.env.local`:

```
EXPO_PUBLIC_DEV_TIER=pro
```

Run the app. Verify:
- Form coach opens without paywall redirect
- Physique check-in opens without paywall redirect
- Ringtone picker opens without paywall redirect

- [ ] **Step 2: Test free tier gating**

Remove or change the env var:

```
EXPO_PUBLIC_DEV_TIER=free
```

Run the app. Verify:
- Tapping Form Coach → paywall modal appears with "Unlock AI Form Coach"
- Tapping Physique Check-in → paywall modal appears
- Profile shows "FREE" with UPGRADE button
- Declining a wake-up call does NOT schedule a snooze re-call

- [ ] **Step 3: Test paywall modal UI**

Navigate to `/paywall` directly. Verify:
- Monthly/Yearly toggle works
- Yearly is pre-selected
- SAVE 15% badge on PRO yearly
- SAVE 20% badge on LEGEND yearly
- Prices display (fallback values in dev)
- Dismiss X button works
- Restore Purchases link is present

- [ ] **Step 4: Commit env file if needed**

```bash
git add .env.local
git commit -m "chore: add DEV_TIER_OVERRIDE for paywall testing"
```
