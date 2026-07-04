import { useState, useEffect, useRef } from 'react';
import { Linking ,
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, Vibration, KeyboardAvoidingView, Platform,
} from 'react-native';
import { getProDemoUrl, getProDemoLabel, programIdToPersona } from '@/lib/exerciseDemoUrls';
import { useVoiceCues } from '@/hooks/useVoiceCues';
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
import { personaFromProgramId } from '@/lib/personaTheme';
import { X as XIcon, Camera, Play, Check } from 'lucide-react-native';

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
  const persona = personaFromProgramId(programId);
  const workout = program.schedule[parseInt(dayIndex ?? '0') % program.schedule.length];

  // Voice cues — coach speaks set-complete, rest-over, last-set, workout-done
  const voice = useVoiceCues();
  const startedRef = useRef(false);

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

  // Coach speaks once when the session opens (after voice prefs load)
  useEffect(() => {
    if (!voice.loaded || startedRef.current) return;
    startedRef.current = true;
    voice.cue('workout_start');
    // Stop any in-flight speech when the user leaves the screen
    return () => voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.loaded]);

  useEffect(() => {
    if (restTimer === null || restTimer <= 0) {
      if (restTimer === 0) {
        Vibration.vibrate([0, 300, 100, 300]);
        voice.cue('rest_over');
        setRestTimer(null);
      }
      return;
    }
    // 3-2-1 verbal countdown when rest is almost over
    if (restTimer === 3) {
      voice.cue('rest_countdown', { seconds: 3 });
    }
    const t = setTimeout(() => setRestTimer((r) => (r ?? 1) - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Voice: if this is the SECOND-TO-LAST set of the exercise, fire "last set"
    // warning on the NEXT one. If this is the LAST set of the LAST exercise → done.
    const exSets = sets[exIdx];
    const isLastSetOfExercise = setIdx === exSets.length - 1;
    const isLastExercise = exIdx === sets.length - 1;
    if (isLastSetOfExercise && isLastExercise) {
      // Defer slightly so "set complete" lands first
      setTimeout(() => voice.cue('workout_complete'), 1200);
    } else if (setIdx === exSets.length - 2) {
      // About to enter the last set
      setTimeout(() => voice.cue('last_set'), 1200);
    } else {
      voice.cue('set_complete');
    }
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
    const topPR = newPRs[0];

    // Voice: shout out the PR if one was hit
    if (topPR?.oneRepMaxKg) {
      voice.cue('pr_hit', { exercise: topPR.exerciseName, kg: Math.round(topPR.oneRepMaxKg) });
    }

    const avgRpe = rpeCount > 0 ? (rpeSum / rpeCount).toFixed(1) : '8.0';
    const sessionScore = Math.min(10, Math.max(5, Math.round(
      6 + (rpeCount > 0 ? (rpeSum / rpeCount - 5) * 0.8 : 2) + (totalVolume > 5000 ? 1 : 0)
    )));

    // Build real per-exercise summary for the post-workout screen
    const exerciseSummary = workout.exercises.map((ex, exIdx) => {
      const exSets = sets[exIdx] ?? [];
      const doneSets = exSets.filter((s) => s.done);
      const reps = doneSets.map((s) => Number(s.reps) || 0);
      const weights = doneSets.map((s) => Number(s.weight) || 0);
      const volume = doneSets.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
      const repRange = reps.length
        ? (Math.min(...reps) === Math.max(...reps) ? `${reps[0]}` : `${Math.min(...reps)}–${Math.max(...reps)}`)
        : '0';
      const isPR = topPR?.exerciseName === ex.name;
      return {
        name: ex.name,
        sets: `${doneSets.length}×${repRange}`,
        volume: `${Math.round(volume)} kg`,
        tag: isPR ? 'PR' : (doneSets.length === exSets.length ? 'COMPLETED' : 'PARTIAL'),
      };
    });

    router.replace({
      pathname: '/post-workout',
      params: {
        sessionName: workout.name,
        score: String(sessionScore),
        durationMin: String(duration),
        volume: (totalVolume / 1000).toFixed(1),
        avgRpe,
        tut: String(Math.round(duration * 0.33)),
        coachId: (() => {
          const pid = programId ?? 'cbum_evolved';
          if (pid.startsWith('dr_mike')) return 'dr_mike';
          if (pid.startsWith('ct_fletcher') || pid.startsWith('ct_')) return 'ct_fletcher';
          if (pid.startsWith('arnold')) return 'arnold';
          if (pid.startsWith('nippard')) return 'nippard';
          return 'cbum';
        })(),
        exercisesJson: JSON.stringify(exerciseSummary),
        newPR: topPR ? 'true' : 'false',
        prExercise: topPR?.exerciseName ?? '',
        prNewRM: topPR?.oneRepMaxKg?.toFixed(1) ?? '',
        prPrevRM: topPR ? String((topPR.oneRepMaxKg ?? 0) - 2.7) : '',
        prWeight: topPR?.weightKg?.toString() ?? '',
        prReps: topPR?.reps?.toString() ?? '',
        prRpe: '9',
      },
    } as any);
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
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
          <XIcon size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.workoutName}>{workout.name}</Text>
          <View style={styles.timerRow}>
            <Text style={[styles.timer, { color: persona.accent }]}>{formatTime(elapsed)}</Text>
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
                    {`Vol ${volPct > 0 ? '+' : ''}${volPct}%`}
                  </Text>
                </View>
              ) : null;
            })()}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.finishBtn, { backgroundColor: persona.accent }, isSaving && { opacity: 0.6 }]}
          onPress={handleFinish}
          disabled={isSaving}
        >
          <Text style={[styles.finishBtnText, { color: persona.ink }]}>{isSaving ? '…' : 'Finish'}</Text>
        </TouchableOpacity>
      </View>

      {/* Rest timer banner */}
      {restTimer !== null && (
        <View style={styles.restBanner}>
          <View style={[styles.restProgress, { width: `${(1 - restPct) * 100}%` as any, backgroundColor: persona.accent + '22' }]} />
          <View style={styles.restContent}>
            <Text style={[styles.restLabel, { color: persona.accent }]}>Rest  {formatTime(restTimer)}</Text>
            <TouchableOpacity onPress={() => setRestTimer(null)} hitSlop={10}>
              <Text style={styles.skipRest}>Skip</Text>
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
                  style={[styles.formBtn, { backgroundColor: persona.accent + '22' }]}
                  onPress={() => router.push({ pathname: '/form-coach', params: { exerciseName: ex.name, persona: programId ?? 'cbum_evolved' } } as any)}
                >
                  <Camera size={12} color={persona.accent} />
                  <Text style={[styles.formBtnText, { color: persona.accent }]}>Form</Text>
                </TouchableOpacity>
              </View>

              {/* Watch pro demo on YouTube — persona-accented so it doesn't
                  clash (a hardcoded red read as The Commander on every coach). */}
              <TouchableOpacity
                style={[styles.demoBtn, { backgroundColor: persona.accent }]}
                onPress={() => {
                  const personaSlug = programIdToPersona(programId);
                  Linking.openURL(getProDemoUrl(ex.name, personaSlug));
                }}
                activeOpacity={0.75}
              >
                <Play size={12} color="#fff" fill="#fff" />
                <Text style={styles.demoBtnText}>
                  {getProDemoLabel(programIdToPersona(programId))}
                </Text>
              </TouchableOpacity>

              <ExerciseProgression exerciseName={ex.name} reps={ex.reps} />

              {/* Set table header */}
              <View style={styles.setHeader}>
                <Text style={[styles.setHeaderCol, { flex: 1 }]}>Set</Text>
                <Text style={[styles.setHeaderCol, { flex: 2 }]}>Kg</Text>
                <Text style={[styles.setHeaderCol, { flex: 2 }]}>Reps</Text>
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
                    style={[
                      styles.doneBtn,
                      s.done && { backgroundColor: persona.accent, borderColor: persona.accent },
                      { width: 44 },
                    ]}
                    onPress={() => !s.done && completeSet(exIdx, setIdx, ex.restSeconds)}
                    disabled={s.done}
                  >
                    {s.done
                      ? <Check size={16} color={persona.ink} strokeWidth={3} />
                      : <Text style={styles.doneBtnText}>○</Text>
                    }
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
  headerCenter: { flex: 1, alignItems: 'center' },
  workoutName: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: -0.2 },
  timer: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 18, letterSpacing: -0.3 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  recoveryPill: {
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1,
  },
  recoveryPillText: { fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.1 },
  finishBtn: {
    borderRadius: 100,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  finishBtnText: { fontFamily: Fonts.displayMedium, fontSize: 12, letterSpacing: 0.2 },

  restBanner: {
    backgroundColor: Colors.raised, height: 44,
    borderBottomWidth: 1, borderBottomColor: Colors.border, overflow: 'hidden',
  },
  restProgress: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
  },
  restContent: {
    flex: 1, height: 44, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16,
  },
  restLabel: { fontFamily: Fonts.bodyBold, fontSize: 13, letterSpacing: 0.2 },
  skipRest: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.1 },

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
    borderRadius: 100,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  formBtnText: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.1 },

  demoBtn: {
    marginHorizontal: 14, marginTop: 4, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 12,
    backgroundColor: '#cc1f1f',
    borderRadius: 100,
  },
  demoBtnText: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: '#fff', letterSpacing: 0.1 },

  setHeader: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  setHeaderCol: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2, textAlign: 'center' },

  setRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6 },
  setRowDone: { opacity: 0.45 },
  setNum: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  setInput: {
    height: 40, backgroundColor: Colors.background, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 8, fontFamily: Fonts.bodyMedium, fontSize: 14,
    color: Colors.text, textAlign: 'center',
  },
  doneBtn: {
    height: 40, borderRadius: 8,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  doneBtnText: { fontSize: 16, color: Colors.textSecondary },
});
