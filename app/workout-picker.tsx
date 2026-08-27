/**
 * /workout-picker — "What do you want to train today?" — Bold Canvas.
 *
 * Lands here when the user taps START WORKOUT on Home or in the StreakNudge.
 * Shows:
 *   1. Today's RECOMMENDED workout (per the program schedule)
 *   2. All OTHER days from the same program (so they can swap on the fly)
 *   3. "Custom — pick exercises yourself" → routes to the EXERCISES library
 *
 * Tapping any card → /workout-lobby with the chosen dayIndex.
 *
 * The crown carries the recommendation as the single hero — including the one
 * accent spend, its Start button — and the light body lists every alternative as
 * borderless hairline-separated rows. Lives outside the (tabs) group so the tab
 * bar doesn't render.
 */
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, Moon, Play } from 'lucide-react-native';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Fonts } from '@/constants/theme';
import { CanvasScreen, Crown, ListRow, Section } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

function getTodayProgramDayIndex(): number {
  const dow = new Date().getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

export default function WorkoutPicker() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const programId = profile?.selected_program ?? 'cbum_evolved';
  const program   = EXPERT_PROGRAMS[programId] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona   = personaFromProgramId(programId);
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The crown is near-black in BOTH schemes, so anything painted on it resolves
  // against the persona's dark triplet rather than the active scheme's.
  const crownPa = personaAccent(persona, 'dark');

  const todayIdx = getTodayProgramDayIndex();
  const todayDay = program.schedule.find((d) => d.day === todayIdx) ?? null;

  // All days other than today's recommended
  const otherDays = useMemo(() =>
    program.schedule
      .filter((d) => d.day !== todayIdx)
      .sort((a, b) => a.day - b.day),
    [program, todayIdx],
  );

  const goTo = (dayIndex: number) => {
    router.replace({
      pathname: '/workout-lobby',
      params: { programId, dayIndex: String(dayIndex) },
    } as any);
  };

  return (
    <CanvasScreen tabBar={false} bottomSpace={36}>
      <Crown
        eyebrow={styleText(persona, todayDay ? 'Recommended · today' : 'Today')}
        title={styleText(persona, todayDay ? todayDay.name : 'REST')}
        accentLine={todayDay ? undefined : styleText(persona, 'DAY')}
        meta={
          todayDay
            ? todayDay.focus
            : 'Recovery is when muscle grows. But pick another day below if you want to push.'
        }
        pills={todayDay ? todayDay.muscleGroups : undefined}
        accent={crownPa.accent}
        onBack={() => router.back()}
        right={todayDay ? undefined : <Moon size={24} color={tokens.crownTextDim} strokeWidth={1.5} />}
      >
        {todayDay ? (
          <>
            {/* The size gap between these numerals and their mono captions IS
                the hero — do not close it. */}
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroNum}>{todayDay.estimatedMinutes}</Text>
                <Text style={styles.heroLabel} numberOfLines={1}>Minutes</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroNum}>{todayDay.exercises.length}</Text>
                <Text style={styles.heroLabel} numberOfLines={1}>Lifts</Text>
              </View>
            </View>

            {/* The one accent moment on this screen. */}
            <PressableScale
              onPress={() => goTo(todayDay.day)}
              haptic="heavy"
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel={`Start ${todayDay.name}`}
              style={[styles.cta, { backgroundColor: crownPa.accent }]}
            >
              <Play size={16} color={crownPa.ink} fill={crownPa.ink} />
              <Text style={[styles.ctaText, { color: crownPa.ink }]}>
                {styleText(persona, 'START THIS')}
              </Text>
            </PressableScale>
          </>
        ) : null}
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <Text style={styles.intro}>
          Pick a workout. Today's plan is recommended — swap any time.
        </Text>

        {/* Other days from the program */}
        <Section label="Or pick another day">
          {otherDays.map((d, i) => (
            <ListRow
              key={d.day}
              title={d.name}
              subtitle={`${d.muscleGroups.join(' · ')} · ${d.estimatedMinutes} min`}
              onPress={() => goTo(d.day)}
              last={i === otherDays.length - 1}
              right={
                <View style={styles.dayMark}>
                  <Text style={styles.dayNum}>{String(d.day + 1).padStart(2, '0')}</Text>
                  <Text style={styles.dayWord}>Day</Text>
                </View>
              }
            />
          ))}
        </Section>

        {/* Custom: route to library */}
        <Section label="Or build your own">
          <ListRow
            title="Pick exercises yourself"
            subtitle="Browse the full exercise library and build a session."
            onPress={() => router.replace({
              pathname: '/(tabs)/workouts',
              params: { section: 'library' },
            } as any)}
            last
            right={<ArrowRight size={18} color={tokens.textTertiary} />}
          />
        </Section>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown hero ─────────────────────────────────────────────────────────────
  heroStats: {
    flexDirection: 'row',
    // Two self-sized columns rather than StatRow's equal thirds: the numerals
    // here are 2-3 digits, and equal columns would strand them mid-crown.
    gap: 34,
    marginTop: 26,
  },
  heroStat: { gap: 7 },
  heroNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 34,
    lineHeight: 35,
    // -0.045em at 34px.
    letterSpacing: -1.53,
    color: t.crownText,
    fontVariant: ['tabular-nums'],
  },
  heroLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 26,
    paddingVertical: 18,
    marginTop: 26,
  },
  ctaText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
  },

  // ── Light body ─────────────────────────────────────────────────────────────
  intro: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: t.textSecondary,
    marginTop: 24,
  },
  dayMark: { alignItems: 'flex-end', gap: 3 },
  dayNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 28,
    // -0.045em at 27px.
    letterSpacing: -1.22,
    color: t.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  dayWord: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
});
