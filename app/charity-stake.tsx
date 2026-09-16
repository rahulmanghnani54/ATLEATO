/**
 * Anti-Charity Stake — REAL $2 USD commitment mechanic (100% opt-in)
 *
 * User stakes REAL $2 per week against an anti-charity (a cause they dislike).
 * Hit the weekly workout goal → $2 refunded automatically + badge.
 * Miss it → $2 forfeited to the anti-charity fund (settled weekly by cron).
 *
 * V1 scope (shipped): UI + local tracking; the CTA says "coming soon". There
 * is NO web checkout: a money-on-the-line stake is an in-app digital purchase,
 * so Play's Payments policy requires Play Billing, not a Lemon Squeezy link.
 * V2 needed (post-launch):
 *   - a one-time Play product (via RevenueCat, like the subscriptions in
 *     lib/billing.ts) for the $2 stake
 *   - the revenuecat-webhook (or a sibling) crediting the stake on purchase
 *   - supabase/functions/charity-stake-settle weekly cron for refund/forfeit
 *
 * Storage: AsyncStorage `charity_stake:v2`
 *
 * Bold Canvas: the money IS the screen, so the amount is the only hero — a 72px
 * numeral on the dark crown, with the whole refund/forfeit contract set small
 * underneath it. The light body is the ledger: this week's counts as oversized
 * numerals, a square segment meter that maps 1:1 to the goal, and hairline-ruled
 * choices instead of chips-in-boxes. The persona accent is one thread (meter →
 * selection → the single filled CTA); everything else is ink.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfWeek, differenceInDays } from 'date-fns';
import { CanvasScreen, Crown, Section, Hairline, BigStat, StatRow } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// ─── Types & constants ────────────────────────────────────────────────────────

const STORAGE_KEY = 'charity_stake:v2';
const STAKE_AMOUNT_USD = 2;
// Stakes are a paid feature — they'll use Google Play Billing at launch.
// No external web checkout (Play Payments policy).

const BODY_PAD = 22; // matches Crown's own horizontal padding

const CHARITIES = [
  { id: 'rival_team', label: 'Rival sports team fund 🏟', emoji: '🏟' },
  { id: 'junk_food', label: 'Generic junk food brand 🍟', emoji: '🍟' },
  { id: 'political', label: 'Political party you oppose 🗳', emoji: '🗳' },
];

const WEEKLY_GOALS = [3, 4, 5];

interface CharityStake {
  charityId: string;
  charityName: string;
  weeklyGoal: number;
  isActive: boolean;
  weekStart: string;       // YYYY-MM-DD
  workoutsThisWeek: number;
  badgesEarned: number;
}

function weekStartISO(): string {
  return startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().slice(0, 10);
}

async function loadStake(): Promise<CharityStake | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CharityStake;
  } catch {
    return null;
  }
}

async function saveStake(stake: CharityStake): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stake));
  } catch {}
}

// ─── Weekly progress bar ─────────────────────────────────────────────────────

/**
 * One square segment per required workout, so the bar reads the exact count as
 * well as the proportion. Square, not pill — the ledger language the rest of the
 * body is built in.
 */
function WeekBar({
  done, goal, accent,
}: { done: number; goal: number; accent: string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={barStyles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${goal} workouts this week`}
      accessibilityValue={{ min: 0, max: goal, now: done }}
    >
      {Array.from({ length: goal }).map((_, i) => (
        <View
          key={i}
          style={[barStyles.seg, { backgroundColor: i < done ? accent : tokens.border }]}
        />
      ))}
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 4, marginTop: 22 },
  seg: { flex: 1, height: 10, borderRadius: 0 },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CharityStakeScreen() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  // The crown is near-black in BOTH schemes, so anything painted on it reads the
  // DARK triplet — the light accents go muddy on ink.
  const crownPa = personaAccent(persona, 'dark');

  const [stake, setStake] = useState<CharityStake | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Setup form state
  const [selectedCharity, setSelectedCharity] = useState(CHARITIES[0].id);
  const [selectedGoal, setSelectedGoal] = useState(3);

  // "Donated" animation
  const [showDonated, setShowDonated] = useState(false);
  const donateAnim = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    (async () => {
      let s = await loadStake();
      if (s) {
        // Check if it's a new week — resolve last week if so
        if (s.weekStart !== weekStartISO() && s.isActive) {
          const hitGoal = s.workoutsThisWeek >= s.weeklyGoal;
          s = {
            ...s,
            weekStart: weekStartISO(),
            workoutsThisWeek: 0,
            badgesEarned: hitGoal ? s.badgesEarned + 1 : s.badgesEarned,
          };
          await saveStake(s);
          if (!hitGoal) {
            triggerDonateAnimation();
          }
        }
      }
      setStake(s);
      setLoaded(true);
    })();
  }, []);

  const triggerDonateAnimation = useCallback(() => {
    setShowDonated(true);
    donateAnim.setValue(0);
    Animated.sequence([
      Animated.timing(donateAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(donateAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowDonated(false));
  }, [donateAnim]);

  const handleActivate = useCallback(async () => {
    const charity = CHARITIES.find((c) => c.id === selectedCharity)!;
    const newStake: CharityStake = {
      charityId: charity.id,
      charityName: charity.label,
      weeklyGoal: selectedGoal,
      isActive: true,
      weekStart: weekStartISO(),
      workoutsThisWeek: 0,
      badgesEarned: 0,
    };
    await saveStake(newStake);
    setStake(newStake);
  }, [selectedCharity, selectedGoal]);

  const handleDeactivate = () => {
    Alert.alert(
      'Cancel stake?',
      'Your anti-charity stake will be removed. All progress for this week is lost.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel stake', style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(STORAGE_KEY);
            setStake(null);
          },
        },
      ],
    );
  };

  // Simulate logging a workout for testing (dev convenience)
  const handleLogWorkout = useCallback(async () => {
    if (!stake || !stake.isActive) return;
    const updated = {
      ...stake,
      workoutsThisWeek: Math.min(stake.workoutsThisWeek + 1, stake.weeklyGoal),
    };
    await saveStake(updated);
    setStake(updated);
  }, [stake]);

  // The crown is identical in every state, so the screen never reflows around
  // the hero while AsyncStorage resolves.
  const crown = (
    <Crown
      eyebrow="Penalty stake · loss aversion"
      title="Skin in the game."
      accent={crownPa.accent}
      onBack={() => router.back()}
    >
      <View style={styles.heroAmount}>
        <Text style={styles.heroSym}>$</Text>
        <Text
          style={styles.heroNum}
          accessibilityLabel={`${STAKE_AMOUNT_USD} US dollars per week`}
        >
          {STAKE_AMOUNT_USD}
        </Text>
        <Text style={styles.heroUnit}>per week</Text>
      </View>

      <Text style={styles.heroRules}>
        Hit your weekly goal → ${STAKE_AMOUNT_USD} refunded automatically.{'\n'}
        Miss it → ${STAKE_AMOUNT_USD} forfeited to the anti-charity pool.
      </Text>
      <Text style={styles.heroNote}>
        Real money. Refundable any time before launch.
      </Text>
    </Crown>
  );

  // Storage still resolving — the body is skeletoned in the shape of the ledger
  // it is about to become, rather than blanked.
  if (!loaded) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={40}>
        {crown}
        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <View style={styles.loading}>
            <Skeleton width="42%" height={9} radius={0} />
            <Skeleton width="66%" height={38} radius={0} />
            <Skeleton height={10} radius={0} />
          </View>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  const hitGoal = stake ? stake.workoutsThisWeek >= stake.weeklyGoal : false;
  const charity = stake ? CHARITIES.find((c) => c.id === stake.charityId) : null;
  const daysLeftInWeek = 7 - differenceInDays(new Date(), startOfWeek(new Date(), { weekStartsOn: 1 }));
  const meterFill = hitGoal ? tokens.success : pa.accentText;

  return (
    <View style={styles.root}>
      <CanvasScreen tabBar={false} bottomSpace={40}>
        {crown}

        <SafeAreaView edges={['left', 'right']} style={styles.body}>

          {/* ── ACTIVE STAKE VIEW ── */}
          {stake && stake.isActive && (
            <>
              <Section label={hitGoal ? '✓ Goal hit this week' : 'Stake active'}>
                <Text style={styles.against}>
                  Staked against {charity?.label ?? stake.charityName}
                </Text>

                <StatRow style={styles.stats}>
                  <BigStat
                    value={stake.workoutsThisWeek}
                    unit={`/ ${stake.weeklyGoal}`}
                    label="Workouts this week"
                    size={38}
                  />
                  <BigStat
                    value={daysLeftInWeek}
                    label={`Day${daysLeftInWeek !== 1 ? 's' : ''} remaining`}
                    size={38}
                  />
                </StatRow>

                <WeekBar
                  done={stake.workoutsThisWeek}
                  goal={stake.weeklyGoal}
                  accent={meterFill}
                />
              </Section>

              {/* Badges earned */}
              {stake.badgesEarned > 0 && (
                <Section label="Badges earned">
                  <Text style={styles.badgeValue}>
                    {'🏅'.repeat(Math.min(stake.badgesEarned, 10))}
                    {stake.badgesEarned > 10 ? ` +${stake.badgesEarned - 10}` : ''}
                  </Text>
                </Section>
              )}

              {/* Log workout (links to real workout flow in production) */}
              {!hitGoal && (
                <PressableScale
                  onPress={() => router.push('/workout-picker' as any)}
                  haptic="heavy"
                  accessibilityRole="button"
                  accessibilityLabel="Start today's workout"
                  // Brand-tone fills on a light page are under 3:1, so the
                  // accentLine hairline is what makes the control identifiable.
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: pa.accent, borderColor: tokens.accentLine },
                  ]}
                >
                  <Text style={[styles.primaryBtnText, { color: pa.ink }]} numberOfLines={1}>
                    START TODAY'S WORKOUT →
                  </Text>
                </PressableScale>
              )}

              {hitGoal && (
                // Left rule instead of a box — Bold Canvas has no card borders.
                <View style={[styles.goalHitBanner, { borderLeftColor: tokens.success }]}>
                  <Text style={[styles.goalHitText, { color: tokens.success }]}>
                    🎉 Weekly goal hit! Stake returned.
                  </Text>
                </View>
              )}

              <PressableScale
                onPress={handleDeactivate}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="Cancel stake"
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Cancel stake</Text>
              </PressableScale>
            </>
          )}

          {/* ── SETUP FORM ── */}
          {!stake && (
            <>
              <Section label="Choose your penalty target">
                {CHARITIES.map((c, i) => {
                  const active = selectedCharity === c.id;
                  return (
                    <View key={c.id}>
                      <PressableScale
                        onPress={() => setSelectedCharity(c.id)}
                        haptic="light"
                        scaleTo={0.98}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={c.label}
                        style={styles.charityRow}
                      >
                        <Text
                          style={[
                            styles.charityText,
                            active && { color: pa.accentText, fontFamily: Fonts.bodySemi },
                          ]}
                        >
                          {c.label}
                        </Text>
                        {active && (
                          <Text style={[styles.checkmark, { color: pa.accentText }]}>✓</Text>
                        )}
                      </PressableScale>
                      {i < CHARITIES.length - 1 ? <Hairline /> : null}
                    </View>
                  );
                })}
              </Section>

              <Section label="Weekly workout goal">
                <View style={styles.goalRow}>
                  {WEEKLY_GOALS.map((g) => {
                    const active = selectedGoal === g;
                    return (
                      <PressableScale
                        key={g}
                        onPress={() => setSelectedGoal(g)}
                        haptic="light"
                        scaleTo={0.96}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${g} workouts per week`}
                        style={[
                          styles.goalChip,
                          active && {
                            backgroundColor: pa.accentSoft,
                            borderColor: tokens.accentLine,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.goalChipNum, active && { color: pa.accentText }]}
                        >
                          {g}
                        </Text>
                        <Text
                          style={[styles.goalChipLabel, active && { color: pa.accentText }]}
                          numberOfLines={1}
                        >
                          workouts
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </Section>

              <Section label="Your stake">
                <Text style={styles.stakePreviewAmount}>${STAKE_AMOUNT_USD} real</Text>
                <Text style={styles.stakePreviewNote}>
                  Real money held by Lemon Squeezy. Hit your weekly goal,
                  we refund automatically. Miss it, the ${STAKE_AMOUNT_USD} forfeits to
                  the anti-charity pool. Fully refundable any time before launch.
                </Text>
              </Section>

              <PressableScale
                onPress={() => {
                  // Money-on-the-line stakes are a paid feature → they'll use Google
                  // Play Billing at launch. We do NOT open an external web checkout
                  // (that violates Google Play's Payments policy).
                  Alert.alert(
                    'Stakes — coming soon',
                    'Money-on-the-line accountability stakes unlock shortly after launch. For now, your streak and coach calls keep you honest — free.',
                    [{ text: 'Got it', style: 'default' }],
                  );
                }}
                haptic="heavy"
                accessibilityRole="button"
                accessibilityLabel="Accountability stakes — coming soon"
                style={[
                  styles.primaryBtn,
                  styles.primaryBtnSpaced,
                  { backgroundColor: pa.accent, borderColor: tokens.accentLine },
                ]}
              >
                <Text style={[styles.primaryBtnText, { color: pa.ink }]} numberOfLines={1}>
                  ACCOUNTABILITY STAKES — COMING SOON
                </Text>
              </PressableScale>
            </>
          )}

          <Text style={styles.disclaimer}>
            Money-on-the-line stakes are coming after launch — nothing is charged
            today. When they go live they'll be 100% opt-in: hit your weekly goal
            and your ${STAKE_AMOUNT_USD} refunds automatically; miss it and it goes
            to a pooled "anti-charity" fund disclosed monthly to all stakers.
          </Text>
        </SafeAreaView>
      </CanvasScreen>

      {/* Donated animation overlay — outside the scroller so it covers the page,
          and last in the tree so it stacks above it on Android too. */}
      {showDonated && (
        <Animated.View
          style={[styles.donatedOverlay, { opacity: donateAnim }]}
          pointerEvents="none"
        >
          <Text style={styles.donatedEmoji}>💸</Text>
          <Text style={styles.donatedText}>VIRTUAL STAKE DONATED</Text>
          <Text style={styles.donatedSub}>No real money moved. Use this feeling next week.</Text>
        </Animated.View>
      )}
    </View>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown: the amount is the only hero on the screen ──
  heroAmount: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 26,
  },
  heroSym: {
    fontFamily: Fonts.displayBold,
    fontSize: 34,
    lineHeight: 62,
    letterSpacing: -1.36,
    color: t.crownTextDim,
  },
  heroNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 72,
    lineHeight: 74,
    // -0.04em at 72px.
    letterSpacing: -2.88,
    color: t.crownText,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginLeft: 10,
    paddingBottom: 14,
  },
  heroRules: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 16,
    color: t.crownText,
  },
  heroNote: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: 10,
    color: t.crownTextDim,
  },

  // ── Loading ──
  loading: { marginTop: 34, gap: 14 },

  // ── Active stake ──
  against: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: t.textSecondary,
  },
  stats: { marginTop: 20 },

  badgeValue: { fontSize: 28, lineHeight: 34 },

  // ── Buttons ──
  primaryBtn: {
    marginTop: 30,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnSpaced: { marginTop: 36 },
  primaryBtnText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10.5,
    letterSpacing: 1.5,
  },
  secondaryBtn: {
    marginTop: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: Fonts.bodySemi,
    fontSize: 14,
    letterSpacing: -0.2,
    color: t.textSecondary,
  },

  goalHitBanner: {
    marginTop: 30,
    borderLeftWidth: 3,
    paddingLeft: 14,
    paddingVertical: 2,
  },
  goalHitText: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
  },

  // ── Setup form ──
  charityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 15,
  },
  charityText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.text,
  },
  checkmark: {
    fontFamily: Fonts.displayBold,
    fontSize: 16,
  },

  goalRow: { flexDirection: 'row', gap: 10 },
  goalChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: t.surfaceAlt,
  },
  goalChipNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 34,
    lineHeight: 35,
    // -0.04em at 34px.
    letterSpacing: -1.36,
    color: t.text,
    fontVariant: ['tabular-nums'],
  },
  goalChipLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 7,
  },

  stakePreviewAmount: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 28,
    // -0.04em at 27px.
    letterSpacing: -1.08,
    color: t.text,
  },
  stakePreviewNote: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    color: t.textSecondary,
  },

  disclaimer: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    lineHeight: 15,
    letterSpacing: 0.4,
    marginTop: 40,
    fontStyle: 'italic',
    textAlign: 'center',
    color: t.textTertiary,
  },

  // ── Donated overlay ──
  // Painted in the CROWN ink, not the scrim: the scrim is a translucent veil
  // over a WHITE page in the light scheme, and neither the danger red nor the
  // dim white sub clears contrast against the grey that produces.
  donatedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.crown,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donatedEmoji: { fontSize: 64, marginBottom: 16 },
  donatedText: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 30,
    // -0.04em at 27px.
    letterSpacing: -1.08,
    color: t.danger,
    marginBottom: 10,
    textAlign: 'center',
  },
  donatedSub: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 32,
    color: t.crownTextDim,
  },
});
