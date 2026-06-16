# Atleato™ Paywall System — Design Spec

## Goal

Add a 3-tier subscription system (Free / Pro $9.99 / Legend $19.99) using `expo-in-app-purchases` with Google Play Billing. Gate premium features behind tier checks. Show a full-screen paywall modal when a free user hits a locked feature.

## Constraints

- Zero ongoing cost — no RevenueCat, no third-party billing service
- `expo-in-app-purchases` handles Google Play Billing directly
- Receipt validation happens on-device (no server-side verification needed for MVP)
- Subscription state cached in AsyncStorage for instant access

## Pricing

| Tier | Monthly | Yearly | Discount | Google Play Product ID |
|---|---|---|---|---|
| FREE | $0 | — | — | — |
| PRO | $9.99/mo | $101.90/yr ($8.49/mo) | 15% off | `atleato_pro_monthly`, `atleato_pro_yearly` |
| LEGEND | $19.99/mo | $191.90/yr ($15.99/mo) | 20% off | `atleato_legend_monthly`, `atleato_legend_yearly` |

4 subscription product IDs registered in Google Play Console.

## Feature Gating Map

| Feature | FREE | PRO | LEGEND |
|---|---|---|---|
| Coaches available | 1 | 3 | All 5 |
| Persona-themed workouts | ✓ | ✓ | ✓ |
| Wake-up calls | ✓ | ✓ | ✓ |
| Territory conquest map | ✓ | ✓ | ✓ |
| Global nutrition (1.2M foods) | ✓ | ✓ | ✓ |
| Streak calendar | ✓ | ✓ | ✓ |
| AI form correction (live camera) | — | ✓ | ✓ |
| Reward chests + leaderboards | — | ✓ | ✓ |
| Physique progress photos | — | ✓ | ✓ |
| Custom ringtone picker | — | ✓ | ✓ |
| Unlimited streak freezes | — | ✓ | ✓ |
| 5-min snooze re-calls | — | — | ✓ |
| Territory heatmap + analytics | — | — | ✓ |
| Advanced form AI + video review | — | — | ✓ |
| Coach voice customization | — | — | ✓ |

### Coach Selection Logic

- FREE: User picks 1 coach at onboarding. Cannot switch without upgrading.
- PRO: User picks up to 3 coaches. Can switch between their selected 3 freely.
- LEGEND: All 5 coaches unlocked. Switch anytime.

## Architecture

### Files

| File | Responsibility |
|---|---|
| `lib/subscriptionManager.ts` | Billing client lifecycle, purchase flow, tier resolution, AsyncStorage cache, AppState re-validation |
| `lib/featureGates.ts` | Pure lookup: `canAccess(featureKey) → boolean`, tier-to-features map, coach count by tier |
| `app/paywall.tsx` | Full-screen paywall modal UI — tier cards, monthly/yearly toggle, savings badges, subscribe/restore buttons |

### `lib/subscriptionManager.ts`

Exports:
- `initBilling(): Promise<void>` — Connect to billing client. Called once in `_layout.tsx` on mount.
- `getUserTier(): 'free' | 'pro' | 'legend'` — Synchronous read from cached state. Returns `'free'` if no active subscription.
- `purchaseSubscription(productId: string): Promise<boolean>` — Initiates Google Play purchase flow. Returns true on success.
- `restorePurchases(): Promise<void>` — Restores previously purchased subscriptions (e.g., after reinstall).
- `addTierChangeListener(cb: (tier) => void): () => void` — Subscribe to tier changes. Returns unsubscribe function.

Internal behavior:
1. On `initBilling()`: connect to store, query active purchases, resolve tier, cache in AsyncStorage.
2. On `AppState` change to `'active'`: re-query purchases from store, update cache if changed.
3. Tier resolution: check all active purchase product IDs. `legend_*` → `'legend'`, `pro_*` → `'pro'`, else → `'free'`. Legend takes precedence if somehow both are active.
4. On purchase success: update cached tier immediately, notify listeners.

### `lib/featureGates.ts`

Exports:
- `canAccess(feature: FeatureKey): boolean` — Checks `getUserTier()` against the required tier for the feature.
- `getMaxCoaches(): number` — Returns 1, 3, or 5 based on tier.
- `getRequiredTier(feature: FeatureKey): 'free' | 'pro' | 'legend'` — Returns the minimum tier needed.

Feature keys (string enum):
```
ai_form_coach        → pro
reward_chests        → pro
physique_photos      → pro
custom_ringtone      → pro
unlimited_freezes    → pro
snooze_recalls       → legend
territory_heatmap    → legend
video_review         → legend
voice_customization  → legend
```

### `app/paywall.tsx`

Full-screen modal route. Receives optional `feature` param indicating which locked feature triggered it.

UI layout:
1. Header: "Unlock [Feature Name]" or "Upgrade Your Plan" (generic)
2. Monthly / Yearly toggle — yearly pre-selected, shows "SAVE 15%" or "SAVE 20%" badge
3. Two tier cards side by side:
   - PRO card: price, feature list, "Subscribe" button
   - LEGEND card: price, feature list, "Subscribe" button, highlighted border if it's the recommended tier for the locked feature
4. "Restore Purchases" text link at bottom
5. Dismiss X button top-right

Styling: Uses persona theme colors. Dark background matching app surface color.

## Integration Points

Existing files that need gate checks added:

| File | Gate Check | Behavior When Blocked |
|---|---|---|
| `app/form-coach.tsx` | `canAccess('ai_form_coach')` | Show paywall modal |
| `app/physique-checkin.tsx` | `canAccess('physique_photos')` | Show paywall modal |
| `app/ringtone-picker.tsx` | `canAccess('custom_ringtone')` | Show paywall modal |
| `app/leaderboard.tsx` | `canAccess('reward_chests')` | Show paywall modal |
| `lib/rewardChest.ts` | `canAccess('reward_chests')` | Return empty/locked state |
| `lib/streakFreezes.ts` | `canAccess('unlimited_freezes')` | Limit to 1 freeze per month for free users |
| `lib/wakeupCalls.ts` | `canAccess('snooze_recalls')` | Skip snooze scheduling |
| Coach selection (onboarding + profile) | `getMaxCoaches()` | Limit selectable coaches |

## App Entry Point

In `app/_layout.tsx`, call `initBilling()` inside the root `useEffect` alongside existing Supabase auth setup. This ensures billing state is resolved before any screen renders.

## Error Handling

- Billing client fails to connect: Default to `'free'` tier. Log warning. Retry on next foreground.
- Purchase cancelled by user: No state change. Return false from `purchaseSubscription()`.
- Purchase fails (network, billing error): Show toast "Purchase failed. Try again." Return false.
- Receipt can't be validated: For MVP, trust the on-device purchase state from the store. No server-side validation.

## Testing

- Mock `expo-in-app-purchases` in dev builds (store not available in Expo Go).
- Add a `__DEV__` override: `DEV_TIER_OVERRIDE` env var to force a tier for testing gated features.
- Test flows: free → purchase pro, free → purchase legend, pro → upgrade to legend, cancel → downgrade to free, restore after reinstall.
