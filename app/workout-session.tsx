import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { Button, Card } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { format } from 'date-fns';

interface SetEntry {
  weight: string;
  reps: string;
  rpe: string;
  done: boolean;
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
  const [sets, setSets] = useState<SetEntry[][]>(
    workout.exercises.map((ex) => Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', rpe: '7', done: false })))
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
      next[exIdx] = next[exIdx].map((s, i) => i === setIdx ? { ...s, [field]: value } : s);
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
    if (!user) return;
    const duration = Math.round((Date.now() - startTime.current) / 60000);

    // Calculate total volume
    let totalVolume = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    const { data: workoutLog } = await (supabase.from('workout_logs') as any).insert({
      user_id: user.id,
      program_id: programId ?? 'cbum_evolved',
      workout_name: workout.name,
      date: format(new Date(), 'yyyy-MM-dd'),
      started_at: new Date(startTime.current).toISOString(),
      completed_at: new Date().toISOString(),
      duration_minutes: duration,
    }).select().single();

    if (workoutLog) {
      const setRows: any[] = [];
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
        await (supabase.from('exercise_sets') as any).insert(setRows);
      }

      // Update total volume and avg RPE on workout log
      if (rpeCount > 0) {
        await (supabase.from('workout_logs') as any)
          .update({ total_volume_kg: totalVolume, average_rpe: rpeSum / rpeCount })
          .eq('id', workoutLog.id);
      }
    }

    router.back();
  };

  const handleClose = () => {
    Alert.alert('End Workout?', 'Progress will not be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: () => router.back() },
    ]);
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
        <Button label="Finish" onPress={handleFinish} style={styles.finishBtn} />
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

      <ScrollView contentContainerStyle={styles.content}>
        {workout.exercises.map((ex, exIdx) => (
          <Card key={exIdx} style={styles.exerciseCard}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            <Text style={styles.exerciseTips}>{ex.tips}</Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 20, color: Colors.textSecondary },
  headerCenter: { flex: 1, alignItems: 'center' },
  workoutName: { ...Typography.bodyMedium },
  timer: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.primary },
  finishBtn: { height: 36, paddingHorizontal: 16 },
  restBanner: { backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 10 },
  restLabel: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  skipRest: { fontSize: 14, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.8)' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  exerciseCard: { padding: Spacing.md },
  exerciseName: { ...Typography.h3, marginBottom: 4 },
  exerciseTips: { ...Typography.caption, color: Colors.textSecondary, marginBottom: Spacing.md, fontStyle: 'italic' },
  setHeader: { flexDirection: 'row', marginBottom: 4 },
  setCol: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  setRowDone: { opacity: 0.5 },
  setInput: { height: 40, backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: 8, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.text, textAlign: 'center' },
  doneBtn: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  doneBtnActive: { backgroundColor: Colors.success },
  doneBtnText: { fontSize: 18, color: Colors.text },
});
