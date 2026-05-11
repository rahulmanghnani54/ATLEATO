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
import { Button, Card } from '@/components/ui';
import { ProgressionBadge } from '@/components/workout/ProgressionBadge';
import { useExerciseHistory } from '@/hooks/useProgression';
import { analyzeProgression, parseRepsRange } from '@/lib/progressionEngine';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

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
  const { programId, dayIndex } = useLocalSearchParams<{ programId: string; dayIndex: string }>();
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
      Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', rpe: '7', done: false }))
    )
  );

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // Rest countdown
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
      if (setsError) {
        console.error('exercise_sets insert error:', setsError.message);
      }
    }

    // Always update total volume; only update average_rpe when available
    const updatePayload: Record<string, number> = { total_volume_kg: totalVolume };
    if (rpeCount > 0) updatePayload.average_rpe = rpeSum / rpeCount;

    await (supabase.from('workout_logs') as any)
      .update(updatePayload)
      .eq('id', workoutLog.id);

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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.workoutName}>{workout.name}</Text>
          <Text style={styles.timer}>{formatTime(elapsed)}</Text>
        </View>
        <Button
          label={isSaving ? '...' : 'Finish'}
          onPress={handleFinish}
          disabled={isSaving}
          style={styles.finishBtn}
        />
      </View>

      {/* Rest timer banner */}
      {restTimer !== null && (
        <View style={styles.restBanner}>
          <Text style={styles.restLabel}>Rest: {formatTime(restTimer)}</Text>
          <TouchableOpacity onPress={() => setRestTimer(null)}>
            <Text style={styles.skipRest}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {workout.exercises.map((ex, exIdx) => (
            <Card key={ex.name} style={styles.exerciseCard}>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              {ex.tips.length > 0 && (
                <Text style={styles.exerciseTips}>{ex.tips[0]}</Text>
              )}
              <ExerciseProgression exerciseName={ex.name} reps={ex.reps} />

              {/* Set rows */}
              <View style={styles.setHeader}>
                <Text style={[styles.setCol, { flex: 1 }]}>Set</Text>
                <Text style={[styles.setCol, { flex: 2 }]}>Weight (kg)</Text>
                <Text style={[styles.setCol, { flex: 2 }]}>Reps</Text>
                <Text style={[styles.setCol, { flex: 1 }]}>RPE</Text>
                <Text style={[styles.setCol, { width: 44 }]}>✓</Text>
              </View>

              {sets[exIdx].map((s, setIdx) => (
                <View key={setIdx} style={[styles.setRow, s.done && styles.setRowDone]}>
                  <Text style={[styles.setCol, { flex: 1 }]}>{setIdx + 1}</Text>
                  <TextInput
                    style={[styles.setInput, { flex: 2 }]}
                    value={s.weight}
                    onChangeText={(v) => updateSet(exIdx, setIdx, 'weight', v)}
                    keyboardType="decimal-pad"
                    placeholder="kg"
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
                    style={[styles.doneBtn, s.done && styles.doneBtnActive]}
                    onPress={() => !s.done && completeSet(exIdx, setIdx, ex.restSeconds)}
                    disabled={s.done}
                  >
                    <Text style={styles.doneBtnText}>{s.done ? '✓' : '○'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 20, color: Colors.textSecondary },
  headerCenter: { flex: 1, alignItems: 'center' },
  workoutName: { ...Typography.bodyMedium },
  timer: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.primary },
  finishBtn: { height: 36, paddingHorizontal: 16 },
  restBanner: {
    backgroundColor: Colors.primary, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
  },
  restLabel: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  skipRest: { fontSize: 14, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.8)' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  exerciseCard: { padding: Spacing.md },
  exerciseName: { ...Typography.h3, marginBottom: 4 },
  exerciseTips: {
    ...Typography.caption, color: Colors.textSecondary,
    marginBottom: Spacing.md, fontStyle: 'italic',
  },
  setHeader: { flexDirection: 'row', marginBottom: 4 },
  setCol: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  setRowDone: { opacity: 0.5 },
  setInput: {
    height: 40, backgroundColor: Colors.background, borderRadius: Radius.sm,
    paddingHorizontal: 8, fontFamily: 'Inter_400Regular', fontSize: 14,
    color: Colors.text, textAlign: 'center',
  },
  doneBtn: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
  },
  doneBtnActive: { backgroundColor: Colors.success },
  doneBtnText: { fontSize: 18, color: Colors.text },
});
