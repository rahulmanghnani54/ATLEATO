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
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

const PROGRAM_COLORS: Record<string, string> = {
  cbum_evolved:         '#dfff1f',
  arnold_blueprint:     '#ffb13a',
  nippard_fundamentals: '#5b8cff',
  ct_strength:          '#ff5b3a',
  dr_mike_mav:          '#00e0a4',
};

const REWARD_TARGET = 3;

function generateCode(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function ReferralScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const [referralCount, setReferralCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const accentColor = PROGRAM_COLORS[profile?.selected_program ?? ''] ?? Colors.primary;
  const code = user ? generateCode(user.id) : 'XXXXXXXX';
  // CRITICAL: the link MUST carry ?ref=CODE — the landing page only attributes
  // a signup to a referrer when this param is present (writes it into
  // waitlist.source as '<base>_ref_<CODE>'). Without it every share is orphaned.
  const shareUrl = `https://atleato.com?ref=${code}`;
  const shareMessage = `Join me on Atleato — train under a legend. Sign up with my link for 7 days Pro free: ${shareUrl}`;

  // Real attribution: count how many waitlist signups carry this code, server-side.
  // Replaces the old fake local counter that bumped on every Share tap.
  const fetchCount = useCallback(async () => {
    if (!user) return;
    try {
      // Cast: referral_count isn't in the generated Supabase types yet.
      const { data, error } = await (supabase.rpc as any)('referral_count', { p_code: code });
      if (!error && typeof data === 'number') setReferralCount(data);
    } catch {
      // network/RPC failure — keep last known count
    }
  }, [user, code]);

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
      await Share.share({
        message: shareMessage,
        title: 'Atleato — Train Under a Legend',
      });
      // No optimistic increment — the count reflects REAL signups, refreshed
      // on focus / pull-to-refresh. Sharing alone isn't a referral; a signup is.
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
          <Text style={styles.heroSub}>Share to give friends 7 days Pro — free</Text>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: accentColor }]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Text style={[styles.shareBtnText, { color: Colors.accentInk }]}>
              SHARE CODE
            </Text>
          </TouchableOpacity>
          <Text style={styles.sharePreview} numberOfLines={2}>{shareMessage}</Text>
        </View>

        {/* Progress toward reward */}
        <View style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>REWARD PROGRESS</Text>
          <Text style={styles.rewardTitle}>Refer 3 friends → 1 month Pro free</Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any, backgroundColor: accentColor }]} />
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.progressCount}>
              <Text style={[styles.progressNum, { color: accentColor }]}>{referralCount}</Text>
              <Text style={styles.progressDenom}> / {REWARD_TARGET} referrals</Text>
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
        </View>

        {/* How it works */}
        <View style={styles.howCard}>
          <Text style={styles.howLabel}>HOW IT WORKS</Text>
          {[
            { n: '1', text: 'Share your code with a friend' },
            { n: '2', text: 'They sign up and enter your code at checkout' },
            { n: '3', text: 'They get 7 days Pro free — you earn progress toward 1 month Pro' },
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
  milestoneRow: { flexDirection: 'row', gap: 8 },
  milestoneDot: { width: 32, height: 32, borderRadius: Radius.full },

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
