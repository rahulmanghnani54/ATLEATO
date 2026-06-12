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
      return;
    }
    // Native billing isn't wired yet — give the user a real, actionable response
    // instead of a silent no-op. Offer the web checkout path as the actual
    // alternative until the in-app SDK ships.
    const tier = productId.toLowerCase().includes('legend') ? 'LEGEND' : 'PRO';
    Alert.alert(
      `${tier} — coming with launch`,
      `In-app purchases activate at our Q3 2026 launch. Until then, the Vanguard Pass on atleato.com locks in your founder pricing for the same plan.\n\nWant the web option now?`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open Vanguard Pass',
          onPress: () => {
            const { Linking } = require('react-native');
            Linking.openURL('https://atleato.com/upsell.html').catch(() => {});
          },
        },
      ],
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
  toggleText: { fontFamily: Fonts.bodyMedium, fontSize: 14, color: Colors.textSecondary },
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
