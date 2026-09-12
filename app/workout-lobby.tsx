/**
 * Workout Lobby — the launch pad.
 *
 * Bold Canvas: the dark <Crown> carries the session name with duration and
 * exercise-count pills, the light body below holds readiness + the exercise
 * manifest as borderless ListRows, and the single accent moment on the screen
 * is the begin button at the bottom.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { useExerciseHistory } from '@/hooks/useProgression';
import { analyzeProgression, parseRepsRange } from '@/lib/progressionEngine';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { Fonts, Spacing } from '@/constants/theme';
import { scoreLabel } from '@/lib/recoveryEngine';
import { getTodayWorkoutModifier } from '@/lib/healthIntegration';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { BigStat, CanvasScreen, Crown, Hairline, ListRow, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { AlertTriangle, HeartPulse, Play } from 'lucide-react-native';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = Spacing.heroPad;

// ─── Weight suggestion for a single exercise ────────────────────────────────
function WeightSuggestion({ exerciseName, reps }: { exerciseName: string; reps: string }) {
  const styles = useThemedStyles(makeStyles);
  const { data: history } = useExerciseHistory(exerciseName);
  if (!history || history.sessions.length === 0) return null;
  const [low, high] = parseRepsRange(reps);
  const suggestion = analyzeProgression(history, low, high);
  if (!suggestion) return null;
  return (
    <Text style={styles.weightSuggestion}>
      Current: {suggestion.currentWeightKg}kg → Target:{' '}
      <Text style={styles.weightTarget}>{suggestion.suggestedWeightKg}kg</Text>
      {' '}({suggestion.suggestedReps} reps)
    </Text>
  );
}

// ─── Recovery block ──────────────────────────────────────────────────────────
function RecoveryCard({
  score,
  volumeModifier,
}: {
  score: number;
  volumeModifier: number;
}) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const pctDelta = Math.round((volumeModifier - 1) * 100);
  const pillLabel =
    pctDelta > 0 ? `+${pctDelta}% volume` : pctDelta < 0 ? `${pctDelta}% volume` : 'Normal volume';
  const pillColor =
    pctDelta > 0 ? tokens.success : pctDelta < 0 ? tokens.warning : tokens.textSecondary;

  // The five score bands collapse to three token colours because `good`/`warn`
  // in the legacy palette were already aliases of success/warning.
  const scoreColor =
    score >= 85
      ? tokens.success
      : score >= 70
      ? tokens.success
      : score >= 50
      ? tokens.warning
      : score >= 35
      ? tokens.warning
      : tokens.danger;

  const label = scoreLabel(score);

  return (
    <View style={styles.recoveryRow}>
      <BigStat value={score} label="Recovery score" size={52} />
      <View style={styles.recoveryChips}>
        <View style={[styles.chip, { borderColor: scoreColor }]}>
          <Text style={[styles.chipText, { color: scoreColor }]}>{label}</Text>
        </View>
        <View style={[styles.chip, { borderColor: pillColor }]}>
          <Text style={[styles.chipText, { color: pillColor }]}>{pillLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function WorkoutLobby() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { programId, dayIndex } = useLocalSearchParams<{ programId: string; dayIndex: string }>();
  const { data: recovery, isLoading } = useTodayRecovery();

  const program = EXPERT_PROGRAMS[programId ?? 'cbum_evolved'] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona = personaFromProgramId(programId);
  const idx = parseInt(dayIndex ?? '0');
  const workout = program.schedule[idx % program.schedule.length];

  // Body sits on the light page; the crown is dark in BOTH schemes, so it takes
  // the dark-tuned persona triplet regardless of the active scheme.
  const pa = personaAccent(persona, scheme);
  const pc = personaAccent(persona, 'dark');

  // volumeModifier from today's recovery check-in (default 1.0 if no check-in)
  const volumeModifier: number = (recovery as any)?.volume_modifier ?? 1.0;
  const hasCheckin = !!recovery;

  // Health integration modifier (from health-dashboard "Apply to Today's Workout")
  const [healthModifier, setHealthModifier] = useState<number | null>(null);
  useEffect(() => {
    getTodayWorkoutModifier().then(setHealthModifier);
  }, []);

  const handleBegin = () => {
    router.replace({
      pathname: '/workout-session',
      params: { programId: programId ?? 'cbum_evolved', dayIndex: String(idx), volumeModifier: String(volumeModifier) },
    } as any);
  };

  return (
    <CanvasScreen tabBar={false} bottomSpace={32}>
      <Crown
        eyebrow={persona.shortName}
        title={workout.name}
        meta={workout.muscleGroups.join(' · ')}
        pills={[`${workout.estimatedMinutes} min`, `${workout.exercises.length} exercises`]}
        accent={pc.accent}
        onBack={() => router.back()}
      />

      <View style={styles.body}>
        {/* Recovery block or missing check-in warning */}
        <Section label="Readiness">
          {isLoading ? (
            <View style={styles.recoveryRow}>
              <View style={styles.recoverySkeleton}>
                <Skeleton width={116} height={56} radius={6} />
                <Skeleton width={88} height={9} radius={3} />
              </View>
              <Skeleton width={104} height={26} radius={999} />
            </View>
          ) : hasCheckin && recovery ? (
            <RecoveryCard
              score={(recovery as any).recovery_score}
              volumeModifier={volumeModifier}
            />
          ) : (
            <PressableScale
              haptic="light"
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel="No morning check-in. Tap to check in."
              style={styles.noCheckinCard}
              onPress={() =>
                router.push({
                  pathname: '/recovery-checkin',
                  params: { returnTo: `/workout-lobby?${new URLSearchParams({ programId: programId ?? 'cbum_evolved', dayIndex: String(idx) }).toString()}` },
                } as any)
              }
            >
              <View style={styles.noCheckinTitleRow}>
                <AlertTriangle size={13} color={tokens.warning} />
                <Text style={styles.noCheckinTitle}>No morning check-in</Text>
              </View>
              <Text style={styles.noCheckinValue}>100%</Text>
              <Text style={styles.noCheckinSub}>
                Tap to check in — your volume will default to 100% if you skip.
              </Text>
            </PressableScale>
          )}
        </Section>

        {/* Health integration modifier badge */}
        {healthModifier !== null && (
          <Section
            label="Health sync"
            right={<HeartPulse size={13} color={tokens.textTertiary} />}
          >
            <Hairline />
            <ListRow
              title="Health recovery modifier"
              subtitle="Applied from Health Dashboard"
              last
              right={
                <Text
                  style={[
                    styles.healthModifierValue,
                    { color: healthModifier >= 1 ? tokens.success : tokens.warning },
                  ]}
                >
                  {healthModifier > 1
                    ? `+${Math.round((healthModifier - 1) * 100)}% volume`
                    : healthModifier < 1
                    ? `${Math.round((healthModifier - 1) * 100)}% volume`
                    : 'Normal volume'}
                </Text>
              }
            />
            <Hairline />
          </Section>
        )}

        {/* Today's workout with adjusted set counts */}
        <Section
          label="Today's workout"
          right={<Text style={styles.sectionCount}>{`${workout.exercises.length}`}</Text>}
        >
          <Hairline />
          {workout.exercises.map((ex) => {
            const adjustedSets = Math.max(1, Math.round(ex.sets * volumeModifier));
            const delta = adjustedSets - ex.sets;
            const deltaColor =
              delta > 0 ? tokens.success : delta < 0 ? tokens.warning : tokens.textSecondary;

            return (
              <View key={ex.name}>
                <ListRow
                  title={ex.name}
                  value={ex.reps}
                  divider={false}
                  style={styles.exerciseRow}
                />
                <View style={styles.exerciseUnder}>
                  <Text style={styles.exerciseMeta}>
                    <Text style={styles.exerciseSetsBase}>{ex.sets} sets</Text>
                    {delta !== 0 && (
                      <Text style={{ color: deltaColor }}>
                        {` → ${adjustedSets} sets (${delta > 0 ? '+' : ''}${delta})`}
                      </Text>
                    )}
                  </Text>
                  <WeightSuggestion exerciseName={ex.name} reps={ex.reps} />
                  {/* Our own technique clip, in-app — replaces the old YouTube
                      search link. Review mode: preview only, BACK returns here. */}
                  <PressableScale
                    haptic="light"
                    scaleTo={0.96}
                    accessibilityRole="button"
                    accessibilityLabel={`Watch ${ex.name} technique`}
                    style={styles.demoLink}
                    onPress={() =>
                      router.push({
                        pathname: '/technique',
                        params: { exerciseName: ex.name, persona: programId ?? 'cbum_evolved', mode: 'review' },
                      } as any)
                    }
                  >
                    <Play size={9} color={tokens.text} fill={tokens.text} />
                    <Text style={styles.demoLinkText}>WATCH TECHNIQUE</Text>
                  </PressableScale>
                </View>
                <Hairline />
              </View>
            );
          })}
        </Section>

        {/* BEGIN WORKOUT — persona-themed, the one accent moment */}
        <PressableScale
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel="Begin workout"
          onPress={handleBegin}
          // A persona fill on a light page needs a boundary of its own; the
          // text-safe tone of the same hue is what makes the control legible.
          style={[styles.beginBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
        >
          <Play size={15} color={pa.ink} fill={pa.ink} />
          <Text style={[styles.beginBtnText, { color: pa.ink }]}>Begin workout</Text>
        </PressableScale>
        {workout.exercises.length > 0 ? (
          <Text style={styles.beginHint}>{`First up · ${workout.exercises[0].name}`}</Text>
        ) : null}
      </View>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Readiness ──────────────────────────────────────────────────────────────
  recoveryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  recoverySkeleton: { gap: 10 },
  recoveryChips: { alignItems: 'flex-end', gap: 7, paddingTop: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },

  noCheckinCard: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  noCheckinTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noCheckinTitle: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.warning,
  },
  noCheckinValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1.98,
    color: t.text,
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  noCheckinSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: t.textSecondary,
    marginTop: 6,
  },

  // ── Health sync ────────────────────────────────────────────────────────────
  healthModifierValue: {
    fontFamily: Fonts.displayMedium,
    fontSize: 15,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },

  // ── Exercise manifest ──────────────────────────────────────────────────────
  sectionCount: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.3,
    color: t.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  // Tightened so the row and its detail block read as one unit.
  exerciseRow: { paddingBottom: 5 },
  exerciseUnder: { paddingBottom: 15, gap: 6, alignItems: 'flex-start' },
  exerciseMeta: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: t.textSecondary,
  },
  exerciseSetsBase: { color: t.textTertiary },
  weightSuggestion: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
    color: t.textTertiary,
  },
  // Only the target number earns full contrast inside the muted suggestion line.
  weightTarget: {
    fontFamily: Fonts.displayMedium,
    color: t.text,
    fontVariant: ['tabular-nums'],
  },
  demoLink: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  demoLinkText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8.5,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.text,
  },

  // ── Launch ─────────────────────────────────────────────────────────────────
  beginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 21,
    marginTop: 36,
  },
  beginBtnText: {
    fontFamily: Fonts.displayBold,
    fontSize: 16,
    letterSpacing: -0.3,
  },
  beginHint: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.textTertiary,
    textAlign: 'center',
    marginTop: 12,
  },
});
