/**
 * /referral — Referral engine screen.
 *
 * Shows user's unique referral code, share button, referral count,
 * and reward progress.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Share, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { refreshReferralReward, getReferralProUntil } from '@/lib/subscriptionManager';
import { createReferralLink } from '@/lib/branchReferral';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

const PROGRAM_COLORS: Record<string, string> = {
  cbum_evolved:         '#dfff1f',
  arnold_blueprint:     '#ffb13a',
  nippard_fundamentals: '#5b8cff',
  ct_strength:          '#ff5b3a',
  dr_mike_mav:          '#00e0a4',
};

const REWARD_TARGET = 10;

function generateCode(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function ReferralScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const [referralCount, setReferralCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [rewardUntil, setRewardUntil] = useState<number | null>(null);

  const accentColor = PROGRAM_COLORS[profile?.selected_program ?? ''] ?? Colors.primary;
  const code = user ? generateCode(user.id) : 'XXXXXXXX';

  // Count = ACTIVE referrals (referred users who opened the app on 3+ distinct
  // days in their first 7 — active_referral_count, mig 022), attributed via
  // Branch deferred deep links. Reward: every 10 active → 1 month Legend,
  // repeatable (claim_referral_reward tops up newly-earned months).
  const fetchCount = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await (supabase.rpc as any)('active_referral_count');
      if (!error && typeof data === 'number') setReferralCount(data);
    } catch {
      // network/RPC failure — keep last known count
    }
    try {
      await refreshReferralReward();
      setRewardUntil(getReferralProUntil());
    } catch {
      // keep last known reward state
    }
  }, [user]);

  // Refetch whenever the screen regains focus (e.g. after sharing + a friend
  // signs up, the count updates next time they open this screen).
  useFocusEffect(
    useCallback(() => { fetchCount(); }, [fetchCount]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCount();
    setRefreshing(false);
  }, [fetchCount]);

  const handleShare = async () => {
    try {
      // Build a Branch deep link (falls back to a plain ?ref= URL if Branch
      // isn't available). The link carries the code so a friend's INSTALL is
      // attributed to this user — that's what counts toward the reward.
      const link = await createReferralLink(code);
      await Share.share({
        message: `Join me on Atleato — an AI coach that actually calls your phone. Install with my link: ${link}`,
        title: 'Atleato — Train Under a Legend',
      });
      // No optimistic increment — the count reflects REAL installs, refreshed
      // on focus / pull-to-refresh. Sharing isn't a referral; an install is.
    } catch {
      // User cancelled share sheet — no-op
    }
  };

  const progressPct = Math.min(referralCount / REWARD_TARGET, 1);
  const needed = Math.max(0, REWARD_TARGET - referralCount);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>REFERRALS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} colors={[accentColor]} />
        }
      >

        {/* Hero referral card */}
        <View style={[styles.heroCard, { borderColor: accentColor }]}>
          <Text style={styles.heroLabel}>YOUR REFERRAL CODE</Text>
          <Text style={[styles.heroCode, { color: accentColor }]}>{code}</Text>
          <Text style={styles.heroSub}>Share your link · refer 10 active friends → 1 month Legend, free</Text>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: accentColor }]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Text style={[styles.shareBtnText, { color: Colors.accentInk }]}>
              SHARE LINK
            </Text>
          </TouchableOpacity>
          <Text style={styles.sharePreview} numberOfLines={2}>
            Your link installs the app for friends and credits the install to you.
          </Text>
        </View>

        {/* Progress toward reward */}
        <View style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>REWARD PROGRESS</Text>
          <Text style={styles.rewardTitle}>Refer 10 active friends → 1 month Legend, free (repeatable)</Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any, backgroundColor: accentColor }]} />
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.progressCount}>
              <Text style={[styles.progressNum, { color: accentColor }]}>{referralCount}</Text>
              <Text style={styles.progressDenom}> / {REWARD_TARGET} active</Text>
            </Text>
            {needed > 0 ? (
              <Text style={styles.progressNeeded}>{needed} more to unlock</Text>
            ) : (
              <Text style={[styles.progressUnlocked, { color: accentColor }]}>REWARD UNLOCKED</Text>
            )}
          </View>

          {/* Milestone dots */}
          <View style={styles.milestoneRow}>
            {Array.from({ length: REWARD_TARGET }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.milestoneDot,
                  i < referralCount
                    ? { backgroundColor: accentColor }
                    : { backgroundColor: Colors.raised, borderColor: Colors.border, borderWidth: 1 },
                ]}
              />
            ))}
          </View>

          {/* Reward GRANTED banner — server confirmed the free Pro month */}
          {rewardUntil && (
            <View style={[styles.grantedBanner, { borderColor: accentColor, backgroundColor: accentColor + '14' }]}>
              <Text style={[styles.grantedTitle, { color: accentColor }]}>Legend unlocked — Vanguard pass active</Text>
              <Text style={styles.grantedSub}>
                Active until {new Date(rewardUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          )}
        </View>

        {/* How it works */}
        <View style={styles.howCard}>
          <Text style={styles.howLabel}>HOW IT WORKS</Text>
          {[
            { n: '1', text: 'Share your link with friends' },
            { n: '2', text: 'They tap it and install Atleato — the install is credited to you automatically' },
            { n: '3', text: 'Hit 10 active referrals → 1 month of Legend, free. Repeatable — refer more, earn more' },
          ].map((step) => (
            <View key={step.n} style={styles.howRow}>
              <View style={[styles.howNum, { borderColor: accentColor }]}>
                <Text style={[styles.howNumText, { color: accentColor }]}>{step.n}</Text>
              </View>
              <Text style={styles.howText}>{step.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { fontSize: 22, color: Colors.text, width: 32 },
  title: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.8 },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  heroCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: 10,
  },
  heroLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8 },
  heroCode: { fontFamily: Fonts.display, fontSize: 38, letterSpacing: 4 },
  heroSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  shareBtn: {
    paddingVertical: 14, paddingHorizontal: 40, borderRadius: Radius.sm, marginTop: 6,
  },
  shareBtnText: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: 1 },
  sharePreview: {
    fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary,
    textAlign: 'center', lineHeight: 16, fontStyle: 'italic', marginTop: 4, paddingHorizontal: 8,
  },

  grantedBanner: {
    marginTop: 14, borderWidth: 1, borderRadius: Radius.md,
    paddingVertical: 12, paddingHorizontal: 14, gap: 3,
  },
  grantedTitle: { fontFamily: Fonts.bodyBold, fontSize: 13, letterSpacing: 0.2 },
  grantedSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary },

  rewardCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 10,
  },
  rewardLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8 },
  rewardTitle: { fontFamily: Fonts.bodySemi, fontSize: 14, color: Colors.text, lineHeight: 20 },
  progressTrack: {
    height: 6, backgroundColor: Colors.raised, borderRadius: Radius.full, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: Radius.full },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressCount: {},
  progressNum: { fontFamily: Fonts.display, fontSize: 20 },
  progressDenom: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary },
  progressNeeded: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.5 },
  progressUnlocked: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8 },
  // Segmented bar — scales to any target (10 segments fit where 10 circles wouldn't)
  milestoneRow: { flexDirection: 'row', gap: 4 },
  milestoneDot: { flex: 1, height: 8, borderRadius: 4 },

  howCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 14,
  },
  howLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howNum: {
    width: 28, height: 28, borderRadius: Radius.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  howNumText: { fontFamily: Fonts.display, fontSize: 12 },
  howText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20, flex: 1 },
});
