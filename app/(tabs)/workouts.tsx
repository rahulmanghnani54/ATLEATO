/**
 * Workouts Tab — Bold Canvas (migrated 2026-08-13)
 *
 * Structure:
 *   Crown        — today's session IS the hero: "Train / Back." + duration,
 *                  exercise count and focus as pills, tinted by the coach.
 *   StatRow      — days/week · sessions · exercises today
 *   Toggle       — TODAY | EXERCISES (deep-linkable via ?section=library)
 *     TODAY:     today's exercises as borderless ListRows, then the whole week
 *                as a quiet schedule list (rest days dimmed, not omitted).
 *     EXERCISES: library counts as BigStats + muscle-group accordion.
 *   Anchor CTA   — persona-filled, "START TODAY'S WORKOUT" / "PICK A WORKOUT"
 *
 * Direction-C version at workouts-v0.tsx.bak / git history.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronRight } from 'lucide-react-native';

import { EXPERT_PROGRAMS } from '@/constants/experts';
import { EXERCISE_LIBRARY, type MuscleGroup } from '@/constants/exerciseLibrary';
import { useAuthStore } from '@/stores/authStore';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { PressableScale } from '@/components/ui/motion';
import {
  BigStat,
  CanvasScreen,
  Crown,
  Hairline,
  ListRow,
  Section,
  StatRow,
  TAB_BAR_SPACE,
} from '@/components/ui/canvas';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getTodayWorkoutIndex(daysPerWeek: number): number | null {
  const dow = new Date().getDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return idx >= daysPerWeek ? null : idx;
}

function weekOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
}

// Monday-first, matching getTodayWorkoutIndex's 0=Mon mapping.
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// ─── Muscle-group accordion ──────────────────────────────────────────────────
function MuscleGroupRow({
  group,
  accentText,
  personaId,
  last,
}: {
  group: MuscleGroup;
  /** Text-safe persona accent — the brand fill colour is under AA as text. */
  accentText: string;
  personaId: string;
  last: boolean;
}) {
  const router = useRouter();
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View>
      <PressableScale
        onPress={() => setOpen((v) => !v)}
        haptic="light"
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${group.label}, ${group.exercises.length} exercises`}
      >
        <View style={styles.groupHead}>
          <Text style={[styles.groupName, { color: tokens.text }]} numberOfLines={1}>
            {group.label}
          </Text>
          <Text style={[styles.groupCount, { color: tokens.textTertiary }]}>
            {group.exercises.length}
          </Text>
          <Chevron size={16} color={tokens.textTertiary} />
        </View>
      </PressableScale>

      {open && (
        <View style={styles.groupBody}>
          {group.exercises.map((ex, i) => (
            <ListRow
              key={ex.name}
              title={ex.name}
              last={i === group.exercises.length - 1}
              onPress={() =>
                router.push({
                  pathname: '/form-coach' as any,
                  params: { exerciseName: ex.name, persona: personaId },
                })
              }
              right={<Text style={[styles.tag, { color: accentText }]}>FORM CHECK</Text>}
            />
          ))}
        </View>
      )}

      {last ? null : <Hairline />}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function Workouts() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  // Section can be deep-linked: /(tabs)/workouts?section=library lands directly
  // on the exercise library (workout-picker's "Pick exercises yourself" uses
  // this so the user doesn't have to tap the Exercises tab themselves).
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<'today' | 'library'>(
    sectionParam === 'library' ? 'library' : 'today',
  );
  useEffect(() => {
    if (sectionParam === 'library' || sectionParam === 'today') setSection(sectionParam);
  }, [sectionParam]);

  const programId = profile?.selected_program ?? 'cbum_evolved';
  const program = EXPERT_PROGRAMS[programId] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona = personaFromProgramId(programId);
  const pa = personaAccent(persona, scheme);
  // The crown is a dark block in BOTH schemes, so it always wants the coach's
  // dark-ground accent — the light triplet is tuned against white and goes muddy
  // on near-black.
  const crownTint = personaAccent(persona, 'dark').accent;

  const todayIdx = getTodayWorkoutIndex(program.daysPerWeek);
  const todayWorkout = todayIdx !== null ? program.schedule[todayIdx % program.schedule.length] : null;
  const isRest = todayWorkout == null;

  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  const ctaLabel = isRest ? 'PICK A WORKOUT →' : `${persona.workoutCTA} →`;
  const libraryCount = EXERCISE_LIBRARY.reduce((n, g) => n + g.exercises.length, 0);

  // Same mapping getTodayWorkoutIndex uses: day i trains while i < daysPerWeek,
  // and the schedule wraps when the program lists fewer days than it trains.
  const week = WEEKDAYS.map((label, i) => ({
    label,
    day: i < program.daysPerWeek ? program.schedule[i % program.schedule.length] : null,
    today: i === todayIdx,
  }));

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      {/* Room for the anchored CTA, which sits a further TAB_BAR_SPACE up. */}
      <CanvasScreen bottomSpace={80}>
        {/* ── 1. CROWN — today's session is the hero ──────────── */}
        <Crown
          eyebrow={`${weekday.toUpperCase()} · WEEK ${weekOfYear()}`}
          title={isRest ? 'Rest' : 'Train'}
          accentLine={isRest ? 'day.' : `${todayWorkout!.name}.`}
          meta={`${program.name} · ${persona.shortName}`}
          pills={
            isRest
              ? ['Recovery', `${program.daysPerWeek} days / week`]
              : [
                  `${todayWorkout!.estimatedMinutes} min`,
                  `${todayWorkout!.exercises.length} exercises`,
                  todayWorkout!.focus,
                ]
          }
          accent={crownTint}
        />

        {/* ── 2. STATS ────────────────────────────────────────── */}
        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <StatRow style={styles.stats}>
            <BigStat value={program.daysPerWeek} label="Days / week" />
            <BigStat value={program.schedule.length} label="Sessions" />
            <BigStat
              value={isRest ? '—' : todayWorkout!.exercises.length}
              label={isRest ? 'Today' : 'Exercises'}
            />
          </StatRow>

          {/* ── 3. SECTION TOGGLE ─────────────────────────────── */}
          <View style={styles.toggle}>
            {([
              ['today', 'Today'],
              ['library', 'Exercises'],
            ] as const).map(([key, label]) => {
              const active = section === key;
              return (
                <PressableScale
                  key={key}
                  onPress={() => setSection(key)}
                  haptic="light"
                  scaleTo={0.97}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={styles.tab}
                >
                  <Text
                    style={[styles.tabText, { color: active ? tokens.text : tokens.textTertiary }]}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.tabRule,
                      { backgroundColor: tokens.text, opacity: active ? 1 : 0 },
                    ]}
                  />
                </PressableScale>
              );
            })}
          </View>
          <Hairline />

          {/* ── 4a. TODAY view ─────────────────────────────────── */}
          {section === 'today' && (
            <>
              {isRest ? (
                // Deliberately quiet, not empty: the rest day gets the same
                // headline weight a session would, then falls silent.
                <Section label="Today">
                  <Text style={[styles.restTitle, { color: tokens.text }]}>Recovery day.</Text>
                  <Text style={[styles.restMeta, { color: tokens.textSecondary }]}>
                    {`${persona.shortName} schedules rest after ${program.daysPerWeek - 1} training days. Hydrate, walk, sleep early.`}
                  </Text>
                </Section>
              ) : (
                <Section label={`Today · ${todayWorkout!.name}`}>
                  {todayWorkout!.exercises.map((ex, i) => (
                    <ListRow
                      key={`${ex.name}-${i}`}
                      title={ex.name}
                      subtitle={`${ex.sets} sets · ${ex.reps} · ${ex.restSeconds}s rest`}
                      value={String(i + 1).padStart(2, '0')}
                      last={i === todayWorkout!.exercises.length - 1}
                      onPress={() =>
                        router.push({
                          pathname: '/form-coach' as any,
                          params: { exerciseName: ex.name, persona: persona.id },
                        })
                      }
                    />
                  ))}
                </Section>
              )}

              {/* The week, as a schedule — rest days stay on the list, dimmed. */}
              <Section label="This week">
                {week.map((d, i) => (
                  <View key={d.label}>
                    <View style={styles.weekRow}>
                      <Text
                        style={[
                          styles.weekDay,
                          { color: d.today ? tokens.text : tokens.textTertiary },
                        ]}
                      >
                        {d.label}
                      </Text>
                      <View style={styles.weekText}>
                        <Text
                          style={[
                            styles.weekName,
                            { color: d.day ? tokens.text : tokens.textTertiary },
                          ]}
                          numberOfLines={1}
                        >
                          {d.day ? d.day.name : 'Rest'}
                        </Text>
                        <Text
                          style={[styles.weekMeta, { color: tokens.textTertiary }]}
                          numberOfLines={1}
                        >
                          {d.day
                            ? `${d.day.focus} · ${d.day.estimatedMinutes} min`
                            : 'Recovery — walk, hydrate, sleep'}
                        </Text>
                      </View>
                      {d.today ? (
                        <Text style={[styles.weekToday, { color: tokens.textSecondary }]}>
                          TODAY
                        </Text>
                      ) : null}
                    </View>
                    {i === week.length - 1 ? null : <Hairline />}
                  </View>
                ))}
              </Section>
            </>
          )}

          {/* ── 4b. EXERCISES library view ─────────────────────── */}
          {section === 'library' && (
            <>
              <Section label="Full exercise library">
                <StatRow>
                  <BigStat value={libraryCount} label="Exercises" />
                  <BigStat value={EXERCISE_LIBRARY.length} label="Muscle groups" />
                </StatRow>
              </Section>

              <Section label="Browse by muscle">
                {EXERCISE_LIBRARY.map((g, i) => (
                  <MuscleGroupRow
                    key={g.id}
                    group={g}
                    accentText={pa.accentText}
                    personaId={persona.id}
                    last={i === EXERCISE_LIBRARY.length - 1}
                  />
                ))}
              </Section>
            </>
          )}
        </SafeAreaView>
      </CanvasScreen>

      {/* ── 5. ANCHOR CTA ───────────────────────────────────── */}
      {/* The tab bar floats and reserves no layout space, so the anchor has to
          clear TAB_BAR_SPACE itself — at the safe-area inset alone the button
          renders entirely underneath the pill. */}
      <View
        pointerEvents="box-none"
        style={[styles.anchor, { paddingBottom: insets.bottom + TAB_BAR_SPACE }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', tokens.bg]}
          style={styles.anchorFade}
        />
        <PressableScale
          onPress={() =>
            isRest
              ? router.push('/workout-picker' as any)
              : router.push({
                  pathname: '/workout-lobby',
                  params: { programId, dayIndex: String(todayIdx ?? 0) },
                } as any)
          }
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={[
            styles.cta,
            {
              backgroundColor: pa.accent,
              // The brand fills sit as low as 2.5:1 on a light page, so the
              // control's edge is carried by the text-safe tone of the same hue.
              borderColor: scheme === 'light' ? pa.accentText : pa.accent,
              shadowColor: pa.accent,
            },
          ]}
        >
          <Text style={[styles.ctaLabel, { color: pa.ink }]}>{ctaLabel}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const PAD = 22;

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: PAD },
  stats: { marginTop: 26 },

  // Toggle — mono caps with an ink rule under the active one. No box, no border.
  toggle: {
    flexDirection: 'row',
    gap: 26,
    marginTop: 30,
  },
  tab: { paddingBottom: 10 },
  // 9/1.7 is the kit's mono micro-label (Section, Crown eyebrow) — the Progress
  // tab's identical toggle uses it too, and the two must not drift apart.
  tabText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  tabRule: {
    height: 2,
    borderRadius: 1,
    marginTop: 9,
  },

  // Rest day
  restTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -1.35,
  },
  restMeta: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 320,
  },

  // Week schedule
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
  },
  weekDay: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    width: 34,
  },
  weekText: { flex: 1, gap: 3 },
  weekName: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  weekMeta: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
  },
  weekToday: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
  },

  // Library accordion
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
  },
  groupName: {
    flex: 1,
    fontFamily: Fonts.displayMedium,
    fontSize: 17,
    letterSpacing: -0.4,
  },
  groupCount: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.2,
    fontVariant: ['tabular-nums'],
  },
  groupBody: { paddingBottom: 8 },
  tag: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
  },

  // Anchored CTA
  anchor: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    bottom: 0,
  },
  anchorFade: {
    position: 'absolute',
    left: -PAD,
    right: -PAD,
    bottom: 0,
    // Tall enough to reach over the CTA, which now starts a TAB_BAR_SPACE up.
    height: 176,
  },
  cta: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.32,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 26,
    elevation: 10,
  },
  ctaLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
});
