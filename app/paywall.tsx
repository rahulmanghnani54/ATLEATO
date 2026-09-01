// app/paywall.tsx
/**
 * /paywall — Full-screen upgrade modal, Bold Canvas.
 *
 * Shows PRO and LEGEND tier cards with monthly/yearly toggle.
 * Yearly is pre-selected with SAVE badges (15% PRO, 20% LEGEND).
 * Optional ?feature= param customizes the header to "Unlock [Feature]".
 *
 * Layout: the dark <Crown> carries the value proposition AND the billing-period
 * switch (a decision made before any price is read), so the light body below can
 * be nothing but the two offers. Price is the hero numeral on both plans —
 * Legend's is the largest thing on the screen.
 *
 * The accent is spent exactly once, on the recommended plan: the RECOMMENDED
 * chip and the Legend CTA. Pro's CTA is outlined so the eye has one obvious
 * target. Neither plan is a bordered card — Legend sits in a full-bleed
 * surfaceAlt band (radius 0, edge to edge) and Pro sits on the bare page, which
 * is what separates them.
 *
 * Pricing, product ids and the "coming soon" Alert are unchanged. The purchase
 * handler now runs real store billing when it is configured, and falls back to
 * that same Alert when it is not.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Fonts, Spacing } from '@/constants/theme';
import { X as XIcon, Check } from 'lucide-react-native';
import { BigStat, CanvasScreen, Crown, Hairline } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { getFeatureLabel, type FeatureKey, getUserTier } from '@/lib/featureGates';
import { track } from '@/lib/analytics';
// Purchases go through subscriptionManager, never lib/billing directly: it is
// the layer that re-reads entitlement from the SERVER after the store takes the
// money. Calling the billing adapter from here would skip that sync.
import {
  startPurchase, restorePurchases, getProductPrices, isBillingConfigured,
  PRODUCT_IDS,
} from '@/lib/subscriptionManager';

type Period = 'monthly' | 'yearly';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = Spacing.heroPad;

const FALLBACK_PRICES: Record<string, string> = {
  [PRODUCT_IDS.PRO_MONTHLY]:    '$9.99',
  [PRODUCT_IDS.PRO_YEARLY]:     '$101.90',
  [PRODUCT_IDS.LEGEND_MONTHLY]: '$19.99',
  [PRODUCT_IDS.LEGEND_YEARLY]:  '$191.90',
};

// These bullets must match FEATURE_TIER in lib/featureGates.ts — that file is
// what actually gates the app, and a bullet it does not back is a promise the
// product breaks. "Unlimited Streak Freezes" was exactly that (pro gets 3), and
// the AI Food Scanner was gated at pro but never advertised.
const PRO_FEATURES = [
  '3 Legend Coaches',
  'AI Form Correction (Live)',
  'AI Food Scanner',
  'Reward Chests + Leaderboards',
  'Physique Progress Photos',
  '3 Streak Freezes',
];

const LEGEND_FEATURES = [
  'All 5 Legend Coaches',
  'Everything in Pro',
  'Coach Voice Customization',
  'Custom Ringtone Picker',
  '5-Min Snooze Re-Calls',
  'Advanced Form AI + Video Review',
];

export default function PaywallScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
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

  // Which gate sent them here is the whole point of this event — "paywall views"
  // alone cannot tell you whether the form coach or the food scanner is what
  // people actually try to buy. `feature` is one of our own FeatureKey slugs.
  useEffect(() => {
    track('paywall_viewed', { feature: typeof feature === 'string' ? feature : null });
  }, [feature]);

  const featureLabel = feature
    ? getFeatureLabel(feature as FeatureKey)
    : null;

  const header = featureLabel
    ? `Unlock ${featureLabel}`
    : 'Upgrade Your Plan';

  const proId = period === 'yearly' ? PRODUCT_IDS.PRO_YEARLY : PRODUCT_IDS.PRO_MONTHLY;
  const legendId = period === 'yearly' ? PRODUCT_IDS.LEGEND_YEARLY : PRODUCT_IDS.LEGEND_MONTHLY;

  // The pre-billing path, unchanged. We deliberately do NOT link out to a web
  // checkout here: selling digital goods via an external payment flow violates
  // Google Play's Payments policy.
  const comingSoon = (productId: string) => {
    const tier = productId.toLowerCase().includes('legend') ? 'LEGEND' : 'PRO';
    Alert.alert(
      `${tier} — coming soon`,
      'Paid plans unlock shortly after launch. You’re on the free plan with full access to your coach, workouts, nutrition, and calls in the meantime.',
      [{ text: 'Got it', style: 'default' }],
    );
  };

  const handlePurchase = async (productId: string) => {
    // Checked before the spinner so an unconfigured build shows the alert
    // immediately, with no loading flash — exactly as it did pre-billing.
    if (!isBillingConfigured()) {
      comingSoon(productId);
      return;
    }

    setLoading(productId);
    // product_id is an enum-ish slug (atleato_pro_monthly …), never free text.
    track('purchase_started', { product_id: productId });
    const result = await startPurchase(productId);
    setLoading(null);

    if (result.status === 'success') {
      track('purchase_completed', { product_id: productId, tier: getUserTier() });
      router.back();
      return;
    }

    // A user who backs out of the store sheet has not failed at anything.
    // Surfacing an error here is what makes a paywall feel like it's arguing
    // with you — say nothing and leave them exactly where they were.
    if (result.status === 'cancelled') {
      // Worth recording even though we say nothing: the gap between started and
      // cancelled is the clearest read on whether the price is landing.
      track('purchase_cancelled', { product_id: productId });
      return;
    }

    // Billing dropped out between the check above and the call.
    if (result.status === 'unavailable') {
      comingSoon(productId);
      return;
    }

    Alert.alert(
      'Purchase not completed',
      result.message ||
        'Something went wrong on the way to the store. You have not been charged. If you believe you were, tap Restore Purchases.',
      [{ text: 'OK', style: 'default' }],
    );
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

  const renderFeature = (label: string, tint: string) => (
    <View key={label} style={styles.featureRow}>
      <Check size={15} color={tint} strokeWidth={2.6} />
      <Text style={styles.featureItem}>{label}</Text>
    </View>
  );

  return (
    <CanvasScreen tabBar={false} bottomSpace={28}>
      <Crown
        eyebrow={featureLabel ? 'Locked feature' : 'Choose your plan'}
        title={header}
        meta="Train under legends. Unlock everything."
        right={
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            scaleTo={0.92}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}
          >
            <XIcon size={19} color={tokens.crownText} />
          </PressableScale>
        }
      >
        {/* Billing period — a segmented switch on the crown, deliberately
            monochrome: the accent belongs to the recommended plan below. */}
        <View style={styles.toggleRow}>
          {(['monthly', 'yearly'] as Period[]).map((p) => {
            const active = period === p;
            return (
              <PressableScale
                key={p}
                onPress={() => setPeriod(p)}
                haptic="light"
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={p === 'yearly' ? 'Bill yearly, save 20%' : 'Bill monthly'}
                style={[styles.toggleBtn, active && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {p === 'yearly' ? 'Yearly' : 'Monthly'}
                </Text>
                {p === 'yearly' ? (
                  <Text style={[styles.toggleSave, active && styles.toggleSaveActive]}>
                    Save 20%
                  </Text>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </Crown>

      {/* ── PRO ── on the bare page: the quieter of the two offers. */}
      <View style={styles.plan}>
        <View style={styles.planHead}>
          <Text style={styles.tierName}>Pro</Text>
        </View>
        <BigStat
          value={prices[proId]}
          unit={period === 'yearly' ? '/yr' : '/mo'}
          label={period === 'yearly' ? 'Billed yearly · $8.49 per month' : 'Billed monthly'}
          size={40}
        />
        {period === 'yearly' && (
          <Text style={styles.saveNote}>Save 15%</Text>
        )}

        <Hairline style={styles.planRule} />

        <View style={styles.featureList}>
          {PRO_FEATURES.map((f) => renderFeature(f, tokens.textTertiary))}
        </View>

        <PressableScale
          onPress={() => handlePurchase(proId)}
          haptic="medium"
          scaleTo={0.97}
          disabled={!!loading}
          accessibilityRole="button"
          accessibilityLabel="Subscribe to Pro"
          style={[styles.cta, styles.ctaGhost]}
        >
          {loading === proId ? (
            <ActivityIndicator color={tokens.text} />
          ) : (
            <Text style={[styles.ctaText, styles.ctaGhostText]}>Subscribe to Pro</Text>
          )}
        </PressableScale>
      </View>

      {/* ── LEGEND ── the recommended plan: a full-bleed tonal band, and the one
          place the accent is spent. */}
      <View style={styles.planBand}>
        <View style={styles.planHead}>
          <Text style={styles.tierName}>Legend</Text>
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>Recommended</Text>
          </View>
        </View>
        <BigStat
          value={prices[legendId]}
          unit={period === 'yearly' ? '/yr' : '/mo'}
          label={period === 'yearly' ? 'Billed yearly · $15.99 per month' : 'Billed monthly'}
          size={52}
        />
        {period === 'yearly' && (
          <Text style={[styles.saveNote, styles.saveNoteAccent]}>Save 20%</Text>
        )}

        <Hairline style={styles.planRule} />

        <View style={styles.featureList}>
          {LEGEND_FEATURES.map((f) => renderFeature(f, tokens.accentText))}
        </View>

        <PressableScale
          onPress={() => handlePurchase(legendId)}
          haptic="heavy"
          scaleTo={0.97}
          disabled={!!loading}
          accessibilityRole="button"
          accessibilityLabel="Subscribe to Legend"
          style={[styles.cta, styles.ctaSolid]}
        >
          {loading === legendId ? (
            <ActivityIndicator color={tokens.accentInk} />
          ) : (
            <Text style={[styles.ctaText, styles.ctaSolidText]}>Subscribe to Legend</Text>
          )}
        </PressableScale>
      </View>

      {/* Restore */}
      <View style={styles.footer}>
        <PressableScale
          onPress={handleRestore}
          haptic="light"
          scaleTo={0.97}
          disabled={restoring}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          style={styles.restoreBtn}
        >
          <Text style={styles.restoreText}>
            {restoring ? 'Restoring...' : 'Restore Purchases'}
          </Text>
        </PressableScale>

        <Text style={styles.legal}>
          Payment will be charged to your Google Play account. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period.
        </Text>
      </View>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: t.crownLine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Period switch — lives on the crown, so every colour here is a crown token.
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 22,
    padding: 5,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: t.crownLine,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  toggleActive: { backgroundColor: t.crownText },
  toggleText: {
    fontFamily: Fonts.bodySemi,
    fontSize: 13.5,
    letterSpacing: -0.1,
    color: t.crownTextDim,
  },
  toggleTextActive: { color: t.crown },
  toggleSave: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  toggleSaveActive: { color: t.crown, opacity: 0.62 },

  // Plans — no borders. Pro sits on the page, Legend on a full-bleed band.
  plan: {
    paddingHorizontal: BODY_PAD,
    paddingTop: 34,
    paddingBottom: 36,
  },
  planBand: {
    backgroundColor: t.surfaceAlt,
    paddingHorizontal: BODY_PAD,
    paddingTop: 34,
    paddingBottom: 38,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  tierName: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: t.text,
  },
  recommendedBadge: {
    backgroundColor: t.accent,
    // Brand emerald is 2.54:1 on a light page — the deep-tone hairline is what
    // gives the chip an identifiable boundary (SC 1.4.11).
    borderWidth: 1,
    borderColor: t.accentLine,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  recommendedText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.accentInk,
  },
  saveNote: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 10,
  },
  saveNoteAccent: { color: t.accentText },

  planRule: { marginTop: 26 },

  featureList: { marginTop: 22, gap: 13 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  featureItem: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14.5,
    lineHeight: 20,
    letterSpacing: -0.1,
    color: t.text,
  },

  cta: {
    marginTop: 30,
    borderRadius: 28,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaGhost: {
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  ctaGhostText: { color: t.text },
  ctaSolid: {
    backgroundColor: t.accent,
    borderWidth: 1,
    borderColor: t.accentLine,
  },
  ctaSolidText: { color: t.accentInk },
  ctaText: {
    fontFamily: Fonts.displayMedium,
    fontSize: 15,
    letterSpacing: 0.1,
  },

  footer: { paddingHorizontal: BODY_PAD, paddingTop: 34 },
  restoreBtn: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  restoreText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.textSecondary,
  },
  legal: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: t.textTertiary,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 18,
  },
});
