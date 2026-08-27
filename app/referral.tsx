/**
 * /referral — Referral engine screen.
 *
 * Shows user's unique referral code, share button, referral count,
 * and reward progress.
 *
 * Bold Canvas: the crown carries the whole invite — the code is the hero, set
 * in tracked mono so it can actually be read aloud or transcribed, with the
 * share action directly under it. The light body is the ledger: the count as an
 * oversized numeral, a ten-segment meter that maps 1:1 to the reward target,
 * and the hairline-ruled steps. The persona accent is the single thread through
 * all three (share fill · meter · unlocked payoff).
 */
import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Share, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CanvasScreen, Crown, Section, Hairline, BigStat, StatRow } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { refreshReferralReward, getReferralProUntil } from '@/lib/subscriptionManager';
import { createReferralLink } from '@/lib/branchReferral';
import { Fonts } from '@/constants/theme';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

const REWARD_TARGET = 10;

const BODY_PAD = 22; // matches Crown's own horizontal padding

const STEPS = [
  { n: '1', text: 'Share your link with friends' },
  { n: '2', text: 'They tap it and install Evulto — the install is credited to you automatically' },
  { n: '3', text: 'Hit 10 active referrals → 1 month of Legend, free. Repeatable — refer more, earn more' },
];

function generateCode(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function ReferralScreen() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, profile } = useAuthStore();
  const [referralCount, setReferralCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [rewardUntil, setRewardUntil] = useState<number | null>(null);

  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  const accentColor = pa.accent;
  // The crown is near-black in BOTH schemes, so anything painted on it reads the
  // DARK triplet — the light accents go muddy on ink.
  const crownPa = personaAccent(persona, 'dark');
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
        message: `Join me on Evulto — an AI coach that actually calls your phone. Install with my link: ${link}`,
        title: 'Evulto — Train Under a Legend',
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
    <CanvasScreen
      tabBar={false}
      bottomSpace={40}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} colors={[accentColor]} />
      }
    >
      {/* ── CROWN — the code is the hero, the share is the only action ── */}
      <Crown
        eyebrow="Referrals"
        title="Invite."
        meta="Share your link · refer 10 active friends → 1 month Legend, free"
        accent={crownPa.accent}
        onBack={() => router.back()}
      >
        <View style={styles.codeBlock}>
          <Text style={styles.codeLabel}>Your referral code</Text>
          <Text
            style={styles.code}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`Your referral code: ${code.split('').join(' ')}`}
          >
            {code}
          </Text>
        </View>

        <PressableScale
          onPress={handleShare}
          haptic="heavy"
          accessibilityRole="button"
          accessibilityLabel="Share your referral link"
          style={[styles.shareBtn, { backgroundColor: crownPa.accent }]}
        >
          <Text style={[styles.shareBtnText, { color: crownPa.ink }]}>SHARE LINK</Text>
        </PressableScale>

        <Text style={styles.sharePreview} numberOfLines={2}>
          Your link installs the app for friends and credits the install to you.
        </Text>
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {/* ── Progress toward reward ── */}
        <Section label="Reward progress">
          <StatRow>
            <BigStat
              value={referralCount}
              unit={`/ ${REWARD_TARGET}`}
              label="Active referrals"
              size={38}
            />
            {needed > 0 ? (
              <BigStat value={needed} label="More to unlock" size={38} />
            ) : (
              <BigStat value="✓" label="Reward unlocked" size={38} />
            )}
          </StatRow>

          {/* Segmented meter — one segment per referral, so it reads the exact
              count as well as the proportion. Filled segments carry the
              text-safe persona tone, which clears AA on the light page without
              needing a hairline around an 10px bar. */}
          <View
            style={styles.meter}
            accessibilityRole="progressbar"
            accessibilityLabel={`${referralCount} of ${REWARD_TARGET} active referrals`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progressPct * 100) }}
          >
            {Array.from({ length: REWARD_TARGET }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.meterSeg,
                  { backgroundColor: i < referralCount ? pa.accentText : tokens.border },
                ]}
              />
            ))}
          </View>

          <Text style={styles.rewardTitle}>
            Refer 10 active friends → 1 month Legend, free (repeatable)
          </Text>

          {/* Reward GRANTED banner — server confirmed the free Pro month */}
          {rewardUntil ? (
            <View style={[styles.granted, { borderLeftColor: pa.accent }]}>
              <Text style={[styles.grantedTitle, { color: pa.accentText }]}>
                Legend unlocked — Vanguard pass active
              </Text>
              <Text style={styles.grantedSub}>
                Active until {new Date(rewardUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </Section>

        {/* ── How it works ── */}
        <Section label="How it works">
          {STEPS.map((step, i) => (
            <View key={step.n}>
              <View style={styles.stepRow}>
                <Text style={styles.stepNum}>{step.n}</Text>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
              {i < STEPS.length - 1 ? <Hairline /> : null}
            </View>
          ))}
        </Section>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown: the code plate ──
  codeBlock: { marginTop: 26 },
  codeLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginBottom: 12,
  },
  code: {
    fontFamily: Fonts.legacyMono,
    fontSize: 40,
    // The whole point of a code: generous tracking so each glyph is separable.
    letterSpacing: 7,
    color: t.crownText,
  },

  shareBtn: {
    marginTop: 26,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  sharePreview: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: 14,
    color: t.crownTextDim,
  },

  // ── Reward progress ──
  meter: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 22,
  },
  // Square, not pill — the ledger language the rest of the body is built in.
  meterSeg: { flex: 1, height: 10, borderRadius: 0 },
  rewardTitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
    color: t.textSecondary,
  },

  // Left rule instead of a box — Bold Canvas has no visible card borders.
  granted: {
    marginTop: 22,
    borderLeftWidth: 3,
    paddingLeft: 14,
    paddingVertical: 2,
    gap: 4,
  },
  grantedTitle: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  grantedSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: t.textSecondary,
  },

  // ── How it works ──
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 15,
  },
  stepNum: {
    width: 26,
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 28,
    // -0.04em at 27px.
    letterSpacing: -1.08,
    color: t.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  stepText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: t.text,
  },
});
