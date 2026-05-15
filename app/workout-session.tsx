import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, Vibration, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { ProgressionBadge } from '@/components/workout/ProgressionBadge';
import { useExerciseHistory } from '@/hooks/useProgression';
import { analyzeProgression, parseRepsRange } from '@/lib/progressionEngine';
import { Colors, Fonts } from '@/constants/theme';
import { detectAndSavePRs } from '@/lib/prDetector';

interface SetEntry {
  weight: string;
  reps: string;
  rpe: string;
  done: boolean;
}

function ExerciseProgression({ exerciseName, reps }: { exerciseName: string; reps: string }) {
  const { data: history } = useExerciseHistory(exerciseName);
  if (!history || history.sessions.length === 0) return null;
  const [low, high] = parseRepsRange(reps);
  const suggestion = analyzeProgression(history, low, high);
  if (!suggestion) return null;
  return <ProgressionBadge suggestion={suggestion} />;
}

export default function WorkoutSession() {
  const router = useRouter();
  const { programId, dayIndex, volumeModifier: volumeModifierParam } = useLocalSearchParams<{
    programId: string;
    dayIndex: string;
    volumeModifier?: string;
  }>();
  const volumeModifier = parseFloat(volumeModifierParam ?? '1.0') || 1.0;
  const user = useAuthStore((s) => s.user);

  const program = EXPERT_PROGRAMS[programId ?? 'cbum_evolved'] ?? EXPERT_PROGRAMS.cbum_evolved;
  const workout = program.schedule[parseInt(dayIndex ?? '0') % program.schedule.length];

  const startTime = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(90);
  const [isSaving, setIsSaving] = useState(false);
  const [sets, setSets] = useState<SetEntry[][]>(
    workout.exercises.map((ex) =>
      Array.from(
        { length: Math.max(1, Math.round(ex.sets * volumeModifier)) },
        () => ({ weight: '', reps: '', rpe: '7', done: false })
      )
    )
  );

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (restTimer === null || restTimer <= 0) {
      if (restTimer === 0) {
        Vibration.vibrate([0, 300, 100, 300]);
        setRestTimer(null);
      }
      return;
    }
    const t = setTimeout(() => setRestTimer((r) => (r ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [restTimer]);

  const updateSet = (exIdx: number, setIdx: number, field: keyof SetEntry, value: string | boolean) => {
    setSets((prev) => {
      const next = prev.map((ex) => [...ex]);
      next[exIdx] = next[exIdx].map((s, i) => (i === setIdx ? { ...s, [field]: value } : s));
      return next;
    });
  };

  const completeSet = (exIdx: number, setIdx: number, restSecs: number) => {
    updateSet(exIdx, setIdx, 'done', true);
    setRestTotal(restSecs);
    setRestTimer(restSecs);
  };

  const formatTime = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const handleFinish = async () => {
    if (!user || isSaving) return;
    setIsSaving(true);

    const duration = Math.round((Date.now() - startTime.current) / 60000);

    const { data: workoutLog, error: logError } = await (supabase.from('workout_logs') as any)
      .insert({
        user_id: user.id,
        program_id: programId ?? 'cbum_evolved',
        workout_name: workout.name,
        date: new Date().toISOString().slice(0, 10),
        started_at: new Date(startTime.current).toISOString(),
        completed_at: new Date().toISOString(),
        duration_minutes: duration,
      })
      .select()
      .single();

    if (logError || !workoutLog) {
      setIsSaving(false);
      Alert.alert('Save Failed', 'Could not save your workout. Please try again.');
      return;
    }

    const setRows: any[] = [];
    let totalVolume = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    sets.forEach((exSets, exIdx) => {
      exSets.forEach((s, setIdx) => {
        if (!s.done) return;
        const w = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps) || 0;
        const rpe = parseFloat(s.rpe) || 7;
        totalVolume += w * r;
        rpeSum += rpe;
        rpeCount++;
        setRows.push({
          workout_log_id: workoutLog.id,
          user_id: user.id,
          exercise_name: workout.exercises[exIdx].name,
          set_number: setIdx + 1,
          reps: r,
          weight_kg: w,
          rpe,
          is_warmup: false,
        });
      });
    });

    if (setRows.length > 0) {
      const { error: setsError } = await (supabase.from('exercise_sets') as any).insert(setRows);
      if (setsError && __DEV__) console.error('exercise_sets insert error:', setsError.message);
    }

    const updatePayload: Record<string, number> = { total_volume_kg: totalVolume };
    if (rpeCount > 0) updatePayload.average_rpe = rpeSum / rpeCount;

    await (supabase.from('workout_logs') as any).update(updatePayload).eq('id', workoutLog.id);

    const newPRs = await detectAndSavePRs(user.id, workoutLog.id);
    if (newPRs.length > 0) {
      const prText = newPRs.map((pr) => `🏆 ${pr.exerciseName}: ${pr.weightKg}kg × ${pr.reps} (e1RM: ${pr.oneRepMaxKg}kg)`).join('\n');
      Alert.alert('New Personal Records! 🎉', prText);
    }

    router.back();
  };

  const handleClose = () => {
    const anyDone = sets.flat().some((s) => s.done);
    Alert.alert(
      'End Workout?',
      anyDone ? 'Your workout will not be logged.' : 'Progress will not be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: () => router.back() },
      ]
    );
  };

  const restPct = restTimer !== null ? restTimer / restTotal : 0;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.workoutName}>{workout.name.toUpperCase()}</Text>
          <View style={styles.timerRow}>
            <Text style={styles.timer}>{formatTime(elapsed)}</Text>
            {(() => {
              const volPct = Math.round((volumeModifier - 1) * 100);
              return volPct !== 0 ? (
                <View style={[
                  styles.recoveryPill,
                  {
                    backgroundColor: volPct > 0 ? 'rgba(57,224,138,0.15)' : 'rgba(255,177,58,0.15)',
                    borderColor: volPct > 0 ? 'rgba(57,224,138,0.3)' : 'rgba(255,177,58,0.3)',
                  },
                ]}>
                  <Text style={[
                    styles.recoveryPillText,
                    { color: volPct > 0 ? Colors.success : Colors.warning },
                  ]}>
                    {`VOL ${volPct > 0 ? '+' : ''}${volPct}%`}
                  </Text>
                </View>
              ) : null;
            })()}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.finishBtn, isSaving && { opacity: 0.6 }]}
          onPress={handleFinish}
          disabled={isSaving}
        >
          <Text style={styles.finishBtnText}>{isSaving ? '…' : 'FINISH'}</Text>
        </TouchableOpacity>
      </View>

      {/* Rest timer banner */}
      {restTimer !== null && (
        <View style={styles.restBanner}>
          <View style={[styles.restProgress, { width: `${(1 - restPct) * 100}%` as any }]} />
          <View style={styles.restContent}>
            <Text style={styles.restLabel}>REST  {formatTime(restTimer)}</Text>
            <TouchableOpacity onPress={() => setRestTimer(null)}>
              <Text style={styles.skipRest}>SKIP</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {workout.exercises.map((ex, exIdx) => (
            <View key={ex.name} style={styles.exerciseCard}>
              {/* Exercise header */}
              <View style={styles.exerciseHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  {ex.tips.length > 0 && (
                    <Text style={styles.exerciseTip}>{ex.tips[0]}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.formBtn}
                  onPress={() => router.push({ pathname: '/form-coach', params: { exerciseName: ex.name } } as any)}
                >
                  <Text style={styles.formBtnText}>📷 FORM</Text>
                </TouchableOpacity>
              </View>

              <ExerciseProgression exerciseName={ex.name} reps={ex.reps} />

              {/* Set table header */}
              <View style={styles.setHeader}>
                <Text style={[styles.setHeaderCol, { flex: 1 }]}>SET</Text>
                <Text style={[styles.setHeaderCol, { flex: 2 }]}>KG</Text>
                <Text style={[styles.setHeaderCol, { flex: 2 }]}>REPS</Text>
                <Text style={[styles.setHeaderCol, { flex: 1 }]}>RPE</Text>
                <Text style={[styles.setHeaderCol, { width: 44, textAlign: 'center' }]}>✓</Text>
              </View>

              {sets[exIdx].map((s, setIdx) => (
                <View key={setIdx} style={[styles.setRow, s.done && styles.setRowDone]}>
                  <Text style={[styles.setNum, { flex: 1 }]}>{setIdx + 1}</Text>
                  <TextInput
                    style={[styles.setInput, { flex: 2 }]}
                    value={s.weight}
                    onChangeText={(v) => updateSet(exIdx, setIdx, 'weight', v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textTertiary}
                    editable={!s.done}
                  />
                  <TextInput
                    style={[styles.setInput, { flex: 2 }]}
                    value={s.reps}
                    onChangeText={(v) => updateSet(exIdx, setIdx, 'reps', v)}
                    keyboardType="number-pad"
                    placeholder={ex.reps}
                    placeholderTextColor={Colors.textTertiary}
                    editable={!s.done}
                  />
                  <TextInput
                    style={[styles.setInput, { flex: 1 }]}
                    value={s.rpe}
                    onChangeText={(v) => updateSet(exIdx, setIdx, 'rpe', v)}
                    keyboardType="decimal-pad"
                    placeholder="7"
                    placeholderTextColor={Colors.textTertiary}
                    editable={!s.done}
                  />
                  <TouchableOpacity
                    style={[styles.doneBtn, s.done && styles.doneBtnActive, { width: 44 }]}
                    onPress={() => !s.done && completeSet(exIdx, setIdx, ex.restSeconds)}
                    disabled={s.done}
                  >
                    <Text style={[styles.doneBtnText, s.done && { color: Colors.accentInk }]}>
                      {s.done ? '✓' : '○'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: Colors.textSecondary },
  headerCenter: { flex: 1, alignItems: 'center' },
  workoutName: { fontFamily: Fonts.display, fontSize: 13, color: Colors.text, letterSpacing: 0.5 },
  timer: { fontFamily: Fonts.mono, fontSize: 18, color: Colors.primary, letterSpacing: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  recoveryPill: {
    borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1,
  },
  recoveryPillText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1 },
  finishBtn: {
    backgroundColor: Colors.primary, borderRadius: 3,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  finishBtnText: { fontFamily: Fonts.display, fontSize: 11, color: Colors.accentInk, letterSpacing: 1 },

  restBanner: {
    backgroundColor: Colors.raised, height: 44,
    borderBottomWidth: 1, borderBottomColor: Colors.border, overflow: 'hidden',
  },
  restProgress: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: Colors.primaryLight,
  },
  restContent: {
    flex: 1, height: 44, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16,
  },
  restLabel: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.primary, letterSpacing: 1.4 },
  skipRest: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1 },

  content: { padding: 16, gap: 12 },

  exerciseCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, overflow: 'hidden',
  },
  exerciseHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exerciseName: { fontFamily: Fonts.display, fontSize: 15, color: Colors.text, marginBottom: 4 },
  exerciseTip: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, lineHeight: 16, fontStyle: 'italic' },
  formBtn: {
    backgroundColor: Colors.primaryLight, borderRadius: 3,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  formBtnText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.primary, letterSpacing: 0.8 },

  setHeader: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  setHeaderCol: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1, textAlign: 'center' },

  setRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6 },
  setRowDone: { opacity: 0.45 },
  setNum: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  setInput: {
    height: 40, backgroundColor: Colors.background, borderRadius: 3,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 8, fontFamily: Fonts.mono, fontSize: 14,
    color: Colors.text, textAlign: 'center',
  },
  doneBtn: {
    height: 40, borderRadius: 3,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  doneBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  doneBtnText: { fontSize: 16, color: Colors.textSecondary },
});
