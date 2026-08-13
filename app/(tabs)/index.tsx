/**
 * Home Dashboard — Bold Canvas.
 *
 * The screen that has to feel premium, so it gets the full treatment:
 *   Crown (dark, tinted with the coach's accent) → greeting + today's headline
 *   ONE hero numeral (the streak) → StatRow of the day's numbers
 *   Fuel block → today's rows → the coach's premium call
 *   Persona-filled CTA pinned above the tab bar
 *
 * Presentation only: every hook, route, param and refetch below is carried over
 * from the Direction C version unchanged.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { PhoneCall } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BigStat,
  CanvasScreen,
  Crown,
  ListRow,
  Section,
  StatRow,
  TAB_BAR_SPACE,
} from '@/components/ui/canvas';
import { CountUp, PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useWorkoutStreak, useThisWeekVolume, useProgramSchedule } from '@/hooks/useDashboardStats';
import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

/** Breathing room between the last scroll row and the top of the pinned CTA. */
const CTA_GAP = 16;

/** Bar width for a macro, clamped so an overshoot can't run past the track. */
function macroWidth(eaten: number, goal: number): DimensionValue {
  return `${Math.min(100, (eaten / Math.max(goal, 1)) * 100)}%`;
}

export default function Dashboard() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  // The CTA is absolutely positioned, so it reserves nothing in the scroll
  // content — the room it needs has to be MEASURED, not guessed: its height
  // moves with the OS font scale and with how long the persona's label is.
  const [ctaBlockHeight, setCtaBlockHeight] = useState(0);
  const onCtaLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setCtaBlockHeight((prev) => (prev === h ? prev : h));
  }, []);
  // The measured block is button + its own bottom padding, and that padding is
  // the same TAB_BAR_SPACE + inset CanvasScreen already reserves — so only the
  // overhang above it, plus a gap, is new.
  const bottomSpace =
    Math.max(0, ctaBlockHeight - (TAB_BAR_SPACE + insets.bottom)) + CTA_GAP;

  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  // The crown is a dark block in BOTH schemes, so its tint always takes the
  // persona's dark-tuned accent — the light triplet is tuned against white and
  // both the glow and the accent line go muddy on near-black.
  const crownTint = personaAccent(persona, 'dark').accent;

  const { data: streak = 0, refetch: refetchStreak, isLoading: streakLoading } = useWorkoutStreak();
  const { data: weekKg = 0, refetch: refetchWeek, isLoading: weekLoading } = useThisWeekVolume();
  const { data: schedule, isLoading: scheduleLoading } = useProgramSchedule();
  const today = schedule?.find((d) => d.isToday);

  // Today's nutrition (eaten) vs the profile's goals — surfaced on Home so the
  // user sees their daily macros + targets at a glance, tap to log.
  const [todayDate] = useState(() => new Date());
  const {
    data: nutrition,
    refetch: refetchNutrition,
    isLoading: nutritionLoading,
  } = useDailyNutrition(todayDate);
  const calEaten = Math.round(nutrition?.calories ?? 0);
  const calGoal = profile?.tdee ?? 2000;
  const macros = [
    { label: 'PROTEIN', eaten: Math.round(nutrition?.proteinG ?? 0), goal: profile?.protein_g ?? 150, color: tokens.macroProtein },
    { label: 'CARBS',   eaten: Math.round(nutrition?.carbsG ?? 0),   goal: profile?.carbs_g ?? 200,   color: tokens.macroCarbs },
    { label: 'FAT',     eaten: Math.round(nutrition?.fatG ?? 0),     goal: profile?.fat_g ?? 65,      color: tokens.macroFat },
  ];

  // Re-fetch streak + volume + nutrition when the user returns to this tab
  useFocusEffect(
    useCallback(() => {
      refetchStreak();
      refetchWeek();
      refetchNutrition();
    }, [refetchStreak, refetchWeek, refetchNutrition]),
  );

  const statsLoading = streakLoading || weekLoading || scheduleLoading;

  // CountUp only animates on a CHANGE, so the hero numeral holds 0 for one frame
  // and then ticks to the real streak. Reduce-motion mounts settled instead.
  // Gated on statsLoading: this state lives on the SCREEN, which mounts before
  // the data does — settling on mount would leave the hero already at its final
  // value by the time the skeleton gives way, and it would never tick at all.
  const [settled, setSettled] = useState(reduced);
  useEffect(() => {
    if (reduced || statsLoading) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [reduced, statsLoading]);

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'Athlete';
  const todayLabel = today?.isRest
    ? `Day ${streak || 1} · Rest`
    : `Day ${streak || 1} · ${today?.workout?.focus ?? 'Train'}`;

  const exerciseCount = today?.workout?.exercises?.length ?? 6;
  const estimatedMinutes = today?.workout?.estimatedMinutes ?? 55;
  const ctaLabel = today?.isRest ? 'PLAN TOMORROW →' : `${persona.workoutCTA} →`;

  // Open the lobby for TODAY's workout. The lobby/session address workouts by
  // ARRAY index, so we must pass programId + today's dayIndex — otherwise the
  // lobby defaults to schedule[0] and shows a different day than Home displays.
  const openTodayWorkout = () => {
    router.push({
      pathname: '/workout-lobby',
      params: {
        programId: profile?.selected_program ?? 'cbum_evolved',
        dayIndex: String(today?.dayIndex ?? 0),
      },
    } as any);
  };

  return (
    <View style={styles.root}>
      <CanvasScreen
        bottomSpace={bottomSpace}
        refreshControl={
          <RefreshControl
            tintColor={pa.accent}
            colors={[pa.accent]}
            refreshing={false}
            onRefresh={() => { refetchStreak(); refetchWeek(); refetchNutrition(); }}
          />
        }
      >
        {/* ── 1. CROWN — greeting + today's headline, in the coach's colour ── */}
        <Crown
          eyebrow={todayLabel}
          title="Let's go,"
          accentLine={`${firstName}.`}
          meta={persona.motivation}
          accent={crownTint}
          pills={[persona.shortName, today?.isRest ? 'REST DAY' : `${exerciseCount} exercises`]}
        />

        <View style={styles.body}>
          {/* ── 2. THE HERO METRIC ─────────────────────────────────────── */}
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>Current streak</Text>
            {statsLoading ? (
              <Skeleton width="62%" height={72} radius={20} />
            ) : (
              <View style={styles.heroRow}>
                <CountUp
                  value={settled ? streak : 0}
                  style={styles.heroValue}
                  accessibilityLabel={`${streak} day streak`}
                />
                <Text style={styles.heroUnit}>{streak === 1 ? 'day' : 'days'}</Text>
              </View>
            )}
            <Text style={styles.heroMeta}>
              {today?.isRest
                ? 'Rest day — recovery is part of the work.'
                : `${exerciseCount} exercises · ${estimatedMinutes} min queued today`}
            </Text>
          </View>

          {/* ── 3. THE DAY'S NUMBERS ───────────────────────────────────── */}
          {statsLoading ? (
            <View style={styles.statsSkeleton}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.statsSkeletonCell}>
                  <Skeleton height={32} radius={10} />
                  <Skeleton width="70%" height={8} radius={4} />
                </View>
              ))}
            </View>
          ) : (
            <StatRow style={styles.stats}>
              <BigStat value={weekKg} unit="k kg" decimals={1} label="Week volume" />
              <BigStat value={calEaten} unit="kcal" label={`of ${calGoal} goal`} />
              <BigStat
                value={today?.isRest ? 'REST' : 'GO'}
                label={today?.isRest ? 'Today' : 'Train day'}
              />
            </StatRow>
          )}

          {/* ── 4. FUEL — real macros vs the profile's goals, tap to log ── */}
          <Section
            label="Today's fuel"
            right={
              <Text style={styles.fuelKcal}>
                {calEaten} / {calGoal} kcal
              </Text>
            }
          >
            <PressableScale
              onPress={() => router.push('/(tabs)/nutrition' as any)}
              haptic="light"
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`Today's macros, ${calEaten} of ${calGoal} kcal. Open nutrition.`}
              style={styles.fuel}
            >
              {nutritionLoading ? (
                <View style={styles.macrosRow}>
                  {macros.map((m) => (
                    <View key={m.label} style={styles.macroCol}>
                      <Skeleton height={20} radius={6} />
                      <Skeleton height={5} radius={3} />
                      <Skeleton width="60%" height={8} radius={4} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.macrosRow}>
                  {macros.map((m) => (
                    <View key={m.label} style={styles.macroCol}>
                      <Text style={styles.macroVal}>
                        {m.eaten}
                        <Text style={styles.macroGoal}>/{m.goal}g</Text>
                      </Text>
                      <View style={styles.macroTrack}>
                        <View
                          style={[
                            styles.macroFill,
                            { width: macroWidth(m.eaten, m.goal), backgroundColor: m.color },
                          ]}
                        />
                      </View>
                      <Text style={styles.macroLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </PressableScale>
          </Section>

          {/* ── 5. TODAY'S ROWS ────────────────────────────────────────── */}
          <Section label="Today">
            {!today?.isRest && (
              <ListRow
                title={today?.workout?.name ?? "Today's Workout"}
                subtitle={`${exerciseCount} exercises · ${estimatedMinutes} min`}
                onPress={openTodayWorkout}
              />
            )}

            <ListRow
              title="Today's Tip"
              subtitle={`From ${persona.shortName} — expires at midnight`}
              onPress={() => router.push('/daily-tip' as any)}
            />

            <ListRow
              title="Recovery check-in"
              subtitle="2 min · adjusts today's volume"
              onPress={() => router.push('/recovery-checkin' as any)}
            />

            <ListRow
              title="Legend progress"
              subtitle={`Level ${Math.floor((streak || 0) / 7) + 1} · ${streak % 7} of 7 to next freeze`}
              onPress={() => router.push('/legend-progress' as any)}
            />

            <ListRow
              title="Streak calendar"
              subtitle={`${streak}-day streak · view full year`}
              onPress={() => router.push('/streak-calendar' as any)}
              last
            />
          </Section>

          {/* ── 6. THE COACH LINE — premium wake-up call ───────────────── */}
          <Section label="Your coach">
            <PressableScale
              onPress={() => router.push('/coach-reminders' as any)}
              haptic="light"
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel="Premium. Your coach calls you. Set up wake-up call."
              style={[styles.wake, { backgroundColor: pa.accentSoft }]}
            >
              <View style={styles.wakeHead}>
                <View style={[styles.wakeIcon, { backgroundColor: pa.accent, borderColor: pa.accentText }]}>
                  <PhoneCall size={22} color={pa.ink} />
                </View>
                <View style={[styles.wakeBadge, { borderColor: pa.accentText }]}>
                  <Text style={[styles.wakeBadgeText, { color: pa.accentText }]}>Premium</Text>
                </View>
              </View>
              <Text style={styles.wakeTitle}>Your coach calls you</Text>
              <Text style={styles.wakeSub}>
                Wake up to a real call from {persona.shortName} — not a boring alarm.
              </Text>
              <Text style={[styles.wakeCta, { color: pa.accentText }]}>Set up wake-up call  →</Text>
            </PressableScale>
          </Section>
        </View>
      </CanvasScreen>

      {/* ── 7. PINNED PRIMARY ACTION ─────────────────────────────────────── */}
      {/* The tab bar is a FLOATING pill that reserves no layout space of its own,
          so a bottom-pinned control has to clear TAB_BAR_SPACE itself — at the
          safe-area inset alone this button sits entirely behind the pill. */}
      <View
        style={[styles.ctaWrap, { paddingBottom: insets.bottom + TAB_BAR_SPACE }]}
        pointerEvents="box-none"
        onLayout={onCtaLayout}
      >
        <PressableScale
          onPress={() =>
            today?.isRest ? router.push('/workout-picker' as any) : openTodayWorkout()
          }
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          // The hairline is load-bearing: a persona fill can sit under 3:1 against
          // the light page, and this outline is what gives the control an edge.
          style={[styles.cta, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
        >
          <Text style={[styles.ctaText, { color: pa.ink }]}>{ctaLabel}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    body: { paddingHorizontal: 22 },

    // ── Hero: one oversized numeral against a tiny mono label ──
    hero: { paddingTop: 30, gap: 10 },
    heroEyebrow: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.7,
      textTransform: 'uppercase',
      color: t.textTertiary,
    },
    heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    heroValue: {
      fontFamily: Fonts.displayBold,
      fontSize: 76,
      lineHeight: 78,
      // -0.045em at 76px.
      letterSpacing: -3.42,
      color: t.text,
      fontVariant: ['tabular-nums'],
    },
    heroUnit: {
      fontFamily: Fonts.legacyMono,
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: t.textTertiary,
      paddingBottom: 14,
    },
    heroMeta: {
      fontFamily: Fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: t.textSecondary,
    },

    stats: { marginTop: 30 },
    statsSkeleton: { flexDirection: 'row', gap: 14, marginTop: 30 },
    statsSkeletonCell: { flex: 1, gap: 9 },

    // ── Fuel ──
    fuel: { paddingTop: 2 },
    fuelKcal: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: t.textSecondary,
    },
    macrosRow: { flexDirection: 'row', gap: 16 },
    macroCol: { flex: 1, gap: 8 },
    macroVal: { fontFamily: Fonts.display, fontSize: 19, letterSpacing: -0.5, color: t.text },
    macroGoal: { fontFamily: Fonts.legacyMono, fontSize: 10, color: t.textTertiary },
    macroTrack: { height: 5, backgroundColor: t.surfaceAlt, borderRadius: 999, overflow: 'hidden' },
    macroFill: { height: '100%', borderRadius: 999 },
    macroLabel: {
      fontFamily: Fonts.legacyMono,
      fontSize: 8,
      letterSpacing: 1.4,
      color: t.textTertiary,
    },

    // ── Coach call ──
    wake: { borderRadius: 26, padding: 22, gap: 10 },
    wakeHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    wakeIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wakeBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
    wakeBadgeText: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    wakeTitle: { fontFamily: Fonts.displayBold, fontSize: 27, letterSpacing: -1.2, color: t.text },
    wakeSub: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19, color: t.textSecondary },
    wakeCta: {
      fontFamily: Fonts.legacyMono,
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginTop: 6,
    },

    // ── Pinned CTA ──
    ctaWrap: { position: 'absolute', left: 22, right: 22, bottom: 0 },
    cta: {
      // minHeight, not height: at a large OS font scale a fixed 58 clipped the
      // label, and it also lied to the onLayout measurement the scroll reserve
      // is derived from. At default scale the label is well under 58, so this
      // renders identically.
      minHeight: 58,
      paddingVertical: 10,
      borderRadius: 29,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {
      fontFamily: Fonts.displayBold,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
  });
