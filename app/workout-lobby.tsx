import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { getProDemoUrl, getProDemoLabel, programIdToPersona } from '@/lib/exerciseDemoUrls';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { useExerciseHistory } from '@/hooks/useProgression';
import { analyzeProgression, parseRepsRange } from '@/lib/progressionEngine';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { Colors, Fonts } from '@/constants/theme';
import { scoreLabel } from '@/lib/recoveryEngine';
import { getTodayWorkoutModifier } from '@/lib/healthIntegration';
import { personaFromProgramId } from '@/lib/personaTheme';
import { ArrowLeft, AlertTriangle, HeartPulse, Play } from 'lucide-react-native';

// ─── Weight suggestion for a single exercise ────────────────────────────────
function WeightSuggestion({ exerciseName, reps }: { exerciseName: string; reps: string }) {
  const { data: history } = useExerciseHistory(exerciseName);
  if (!history || history.sessions.length === 0) return null;
  const [low, high] = parseRepsRange(reps);
  const suggestion = analyzeProgression(history, low, high);
  if (!suggestion) return null;
  return (
    <Text style={styles.weightSuggestion}>
      Current: {suggestion.currentWeightKg}kg → Target:{' '}
      <Text style={{ color: Colors.primary }}>{suggestion.suggestedWeightKg}kg</Text>
      {' '}({suggestion.suggestedReps} reps)
    </Text>
  );
}

// ─── Recovery card ───────────────────────────────────────────────────────────
function RecoveryCard({
  score,
  volumeModifier,
}: {
  score: number;
  volumeModifier: number;
}) {
  const pctDelta = Math.round((volumeModifier - 1) * 100);
  const pillLabel =
    pctDelta > 0 ? `+${pctDelta}% volume` : pctDelta < 0 ? `${pctDelta}% volume` : 'Normal volume';
  const pillColor =
    pctDelta > 0 ? Colors.success : pctDelta < 0 ? Colors.warning : Colors.textSecondary;

  const scoreColor =
    score >= 85
      ? Colors.success
      : score >= 70
      ? Colors.good
      : score >= 50
      ? Colors.warning
      : score >= 35
      ? Colors.warn
      : Colors.error;

  const label = scoreLabel(score);

  return (
    <View style={[styles.recoveryCard, { borderColor: scoreColor + '44' }]}>
      <View style={styles.recoveryCardRow}>
        <View>
          <Text style={styles.monoLabel}>Recovery score</Text>
          <Text style={[styles.recoveryScore, { color: scoreColor }]}>{score}</Text>
          <Text style={[styles.recoveryLabel, { color: scoreColor }]}>{label}</Text>
        </View>
        <View style={[styles.volumePill, { borderColor: pillColor + '88' }]}>
          <Text style={[styles.volumePillText, { color: pillColor }]}>{pillLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function WorkoutLobby() {
  const router = useRouter();
  const { programId, dayIndex } = useLocalSearchParams<{ programId: string; dayIndex: string }>();
  const { data: recovery, isLoading } = useTodayRecovery();

  const program = EXPERT_PROGRAMS[programId ?? 'cbum_evolved'] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona = personaFromProgramId(programId);
  const idx = parseInt(dayIndex ?? '0');
  const workout = program.schedule[idx % program.schedule.length];

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
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <ArrowLeft size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headline}>{workout.name}</Text>
          <Text style={styles.monoLabel}>{workout.muscleGroups.join(' · ')}</Text>
        </View>

        {/* Recovery card or missing check-in warning */}
        {isLoading ? null : hasCheckin && recovery ? (
          <RecoveryCard
            score={(recovery as any).recovery_score}
            volumeModifier={volumeModifier}
          />
        ) : (
          <TouchableOpacity
            style={styles.noCheckinCard}
            onPress={() =>
              router.push({
                pathname: '/recovery-checkin',
                params: { returnTo: `/workout-lobby?${new URLSearchParams({ programId: programId ?? 'cbum_evolved', dayIndex: String(idx) }).toString()}` },
              } as any)
            }
          >
            <View style={styles.noCheckinTitleRow}>
              <AlertTriangle size={14} color={Colors.warning} />
              <Text style={styles.noCheckinTitle}>No morning check-in</Text>
            </View>
            <Text style={styles.noCheckinSub}>
              Tap to check in — your volume will default to 100% if you skip.
            </Text>
          </TouchableOpacity>
        )}

        {/* Health integration modifier badge */}
        {healthModifier !== null && (
          <View style={[
            styles.healthModifierCard,
            {
              borderColor: healthModifier >= 1
                ? `${Colors.success}44`
                : `${Colors.warning}44`,
            },
          ]}>
            <View style={styles.healthModifierLabelRow}>
              <HeartPulse size={14} color={Colors.textTertiary} />
              <Text style={styles.healthModifierLabel}>Health recovery modifier</Text>
            </View>
            <Text style={[
              styles.healthModifierValue,
              { color: healthModifier >= 1 ? Colors.success : Colors.warning },
            ]}>
              {healthModifier > 1
                ? `+${Math.round((healthModifier - 1) * 100)}% volume`
                : healthModifier < 1
                ? `${Math.round((healthModifier - 1) * 100)}% volume`
                : 'Normal volume'}
            </Text>
            <Text style={styles.healthModifierSub}>Applied from Health Dashboard</Text>
          </View>
        )}

        {/* Today's workout with adjusted set counts */}
        <Text style={styles.sectionLabel}>Today's workout</Text>
        <View style={styles.exerciseList}>
          {workout.exercises.map((ex) => {
            const adjustedSets = Math.max(1, Math.round(ex.sets * volumeModifier));
            const delta = adjustedSets - ex.sets;
            const deltaColor =
              delta > 0 ? Colors.success : delta < 0 ? Colors.warning : Colors.textSecondary;

            return (
              <View key={ex.name} style={styles.exerciseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    <Text style={styles.exerciseSetsBase}>{ex.sets} sets</Text>
                    {delta !== 0 && (
                      <Text style={{ color: deltaColor }}>
                        {` → ${adjustedSets} sets (${delta > 0 ? '+' : ''}${delta})`}
                      </Text>
                    )}
                  </Text>
                  <WeightSuggestion exerciseName={ex.name} reps={ex.reps} />
                  <TouchableOpacity
                    style={styles.demoLink}
                    onPress={() => {
                      const personaSlug = programIdToPersona(programId);
                      Linking.openURL(getProDemoUrl(ex.name, personaSlug));
                    }}
                    activeOpacity={0.7}
                  >
                    <Play size={11} color="#fff" fill="#fff" />
                    <Text style={styles.demoLinkText}>
                      {getProDemoLabel(programIdToPersona(programId))}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.exerciseRepsRight}>{ex.reps}</Text>
              </View>
            );
          })}
        </View>

        {/* BEGIN WORKOUT — persona-themed */}
        <TouchableOpacity
          style={[styles.beginBtn, { backgroundColor: persona.accent }]}
          onPress={handleBegin}
          activeOpacity={0.85}
        >
          <Play size={16} color={persona.ink} fill={persona.ink} />
          <Text style={[styles.beginBtnText, { color: persona.ink }]}>Begin workout</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14 },

  header: { marginBottom: 20 },
  backBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  headline: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, letterSpacing: -0.5 },
  monoLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2, marginTop: 4 },

  recoveryCard: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderRadius: 10, padding: 16, marginBottom: 20,
  },
  recoveryCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recoveryScore: { fontFamily: Fonts.display, fontSize: 48, lineHeight: 48 },
  recoveryLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.2, marginTop: 2 },
  volumePill: {
    borderWidth: 1, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  volumePillText: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.1 },

  noCheckinCard: {
    backgroundColor: 'rgba(255,177,58,0.08)', borderWidth: 1,
    borderColor: 'rgba(255,177,58,0.3)', borderRadius: 10,
    padding: 16, marginBottom: 20,
  },
  noCheckinTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  noCheckinTitle: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.warning, letterSpacing: 0.1 },
  noCheckinSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.warning, lineHeight: 18 },

  sectionLabel: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textTertiary, letterSpacing: 0.2, marginBottom: 10 },

  exerciseList: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 10, overflow: 'hidden', marginBottom: 20,
  },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exerciseName: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, marginBottom: 3 },
  exerciseMeta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.1 },
  exerciseSetsBase: { color: Colors.textTertiary },
  exerciseRepsRight: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textTertiary, marginLeft: 10 },
  weightSuggestion: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary, marginTop: 3 },
  demoLink: {
    marginTop: 6, alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#cc1f1f', borderRadius: 100,
  },
  demoLinkText: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: '#fff', letterSpacing: 0.1 },

  beginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 100, paddingVertical: 16,
  },
  beginBtnText: { fontFamily: Fonts.displayMedium, fontSize: 15, letterSpacing: 0.2 },

  healthModifierCard: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderRadius: 10, padding: 14, marginBottom: 16,
  },
  healthModifierLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  healthModifierLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2 },
  healthModifierValue: { fontFamily: Fonts.display, fontSize: 16, marginBottom: 4 },
  healthModifierSub: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary },
});
