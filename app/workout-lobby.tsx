import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { useExerciseHistory } from '@/hooks/useProgression';
import { analyzeProgression, parseRepsRange } from '@/lib/progressionEngine';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { Colors, Fonts } from '@/constants/theme';
import { scoreLabel } from '@/lib/recoveryEngine';

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
    pctDelta > 0 ? `+${pctDelta}% VOLUME` : pctDelta < 0 ? `${pctDelta}% VOLUME` : 'NORMAL VOLUME';
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

  const label = scoreLabel(score).toUpperCase();

  return (
    <View style={[styles.recoveryCard, { borderColor: scoreColor + '44' }]}>
      <View style={styles.recoveryCardRow}>
        <View>
          <Text style={styles.monoLabel}>RECOVERY SCORE</Text>
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
  const idx = parseInt(dayIndex ?? '0');
  const workout = program.schedule[idx % program.schedule.length];

  // volumeModifier from today's recovery (default 1.0 if no check-in)
  const volumeModifier: number = (recovery as any)?.volume_modifier ?? 1.0;
  const hasCheckin = !!recovery;

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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headline}>{workout.name.toUpperCase()}</Text>
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
            <Text style={styles.noCheckinTitle}>⚠ NO MORNING CHECK-IN</Text>
            <Text style={styles.noCheckinSub}>
              Tap to check in — your volume will default to 100% if you skip.
            </Text>
          </TouchableOpacity>
        )}

        {/* Today's workout with adjusted set counts */}
        <Text style={styles.sectionLabel}>TODAY'S WORKOUT</Text>
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
                </View>
                <Text style={styles.exerciseRepsRight}>{ex.reps}</Text>
              </View>
            );
          })}
        </View>

        {/* BEGIN WORKOUT */}
        <TouchableOpacity style={styles.beginBtn} onPress={handleBegin} activeOpacity={0.85}>
          <Text style={styles.beginBtnText}>BEGIN WORKOUT</Text>
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
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 18, color: Colors.textSecondary },
  headline: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, letterSpacing: -0.5 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginTop: 4 },

  recoveryCard: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderRadius: 6, padding: 16, marginBottom: 20,
  },
  recoveryCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recoveryScore: { fontFamily: Fonts.display, fontSize: 48, lineHeight: 48 },
  recoveryLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2, marginTop: 2 },
  volumePill: {
    borderWidth: 1, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  volumePillText: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1 },

  noCheckinCard: {
    backgroundColor: 'rgba(255,177,58,0.08)', borderWidth: 1,
    borderColor: 'rgba(255,177,58,0.3)', borderRadius: 6,
    padding: 16, marginBottom: 20,
  },
  noCheckinTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.warning, letterSpacing: 1.2, marginBottom: 6 },
  noCheckinSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.warning, lineHeight: 18 },

  sectionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 2, marginBottom: 10 },

  exerciseList: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 6, overflow: 'hidden', marginBottom: 20,
  },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exerciseName: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, marginBottom: 3 },
  exerciseMeta: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary },
  exerciseSetsBase: { color: Colors.textTertiary },
  exerciseRepsRight: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textTertiary, marginLeft: 10 },
  weightSuggestion: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 3, letterSpacing: 0.3 },

  beginBtn: {
    backgroundColor: Colors.primary, borderRadius: 4,
    paddingVertical: 16, alignItems: 'center',
  },
  beginBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 1 },
});
