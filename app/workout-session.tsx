/**
 * Active workout session — Bold Canvas.
 *
 * Read mid-set, at arm's length, with sweat in your eyes. The crown carries the
 * exercise you are ON right now at hero size; the rest countdown takes the hero
 * slot the moment rest starts. Everything below it recedes into borderless cards.
 *
 * The crown is a DARK block in BOTH schemes, so anything coloured inside it
 * resolves against TOKENS.dark and the persona's dark accent — the light-scheme
 * accents are tuned against a white page and go muddy on ink.
 *
 * Timer, logging, progression and persistence are untouched: this file changed
 * presentation only.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  type DimensionValue,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, Camera, Check } from 'lucide-react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';

import { Crown, Hairline, Section } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { ProgressionBadge } from '@/components/workout/ProgressionBadge';
import { hasVisionCoverage } from '@/constants/exerciseFormLibrary';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { Fonts } from '@/constants/theme';
import { clearActiveSession, getActiveSession, saveActiveSession, WORKOUT_SESSION_NOTIF_ID, type ActiveSession } from '@/lib/activeSession';
import { useExerciseHistory } from '@/hooks/useProgression';
import { useVoiceCues } from '@/hooks/useVoiceCues';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { detectAndSavePRs } from '@/lib/prDetector';
import { analyzeProgression, parseRepsRange } from '@/lib/progressionEngine';
import { supabase } from '@/lib/supabase';
import { TOKENS, useTheme, useThemedStyles } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { track } from '@/lib/analytics';

interface SetEntry {
  weight: string;
  reps: string;
  rpe: string;
  done: boolean;
}

// Clock and set numerals must not jitter as they tick/change width.
const TABULAR: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

// How long the screen may sit on unsaved changes. Long enough that typing a
// weight doesn't hit storage per keystroke, short enough that a hard kill loses
// at most one field.
const PERSIST_THROTTLE_MS = 1500;

// ── Ongoing "workout in progress" notification ──────────────────────────────
// Silent, sticky status-bar chip for the length of the session, so a lifter who
// left the screen has a one-tap way back. Its OWN low-importance channel — the
// call channels (coach-incoming-calls-v3 / coach-on-call) ring and vibrate, and
// this must never make a sound mid-set. Android only: `ongoing` and the
// chronometer are Android concepts, and on iOS this would surface as an actual
// alert banner instead of a passive chip.
const SESSION_CHANNEL = 'workout-session-ongoing';
// Shared with app/_layout's boot-time reconciliation — one source of truth.
const SESSION_NOTIF_ID = WORKOUT_SESSION_NOTIF_ID;

async function showSessionNotification(args: {
  title: string;
  body: string;
  startedAt: number;
  accent: string;
}): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: SESSION_CHANNEL,
      name: 'Workout in progress',
      description: 'Silent reminder while a workout session is open',
      importance: AndroidImportance.LOW,
      vibration: false,
    });
    await notifee.displayNotification({
      id: SESSION_NOTIF_ID,
      title: args.title,
      body: args.body,
      android: {
        channelId: SESSION_CHANNEL,
        importance: AndroidImportance.LOW,
        ongoing: true,            // non-dismissable while the session is live
        autoCancel: false,
        onlyAlertOnce: true,      // re-displays on exercise change must stay silent
        color: args.accent,
        // The OS ticks elapsed time itself — no JS timer writing a notification
        // once a second while the user is lifting.
        timestamp: args.startedAt,
        showTimestamp: true,
        showChronometer: true,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch {
    // The chip is a convenience; a Notifee failure must never affect the workout.
  }
}

async function hideSessionNotification(): Promise<void> {
  try { await notifee.cancelNotification(SESSION_NOTIF_ID); } catch { /* ignore */ }
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
  // Long rest gaps between sets mean the screen would otherwise sleep and the
  // user has to unlock the phone with chalky hands to log the next set.
  useKeepAwake();

  const router = useRouter();
  const { programId, dayIndex, volumeModifier: volumeModifierParam } = useLocalSearchParams<{
    programId: string;
    dayIndex: string;
    volumeModifier?: string;
  }>();
  const volumeModifier = parseFloat(volumeModifierParam ?? '1.0') || 1.0;
  // Identity of this session for the resume checkpoint — a stored session is
  // only restored onto the SAME program day it was recorded against.
  const resolvedProgramId = programId ?? 'cbum_evolved';
  const resolvedDayIndex = parseInt(dayIndex ?? '0', 10) || 0;
  const user = useAuthStore((s) => s.user);

  const program = EXPERT_PROGRAMS[programId ?? 'cbum_evolved'] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona = personaFromProgramId(programId);
  const workout = program.schedule[parseInt(dayIndex ?? '0') % program.schedule.length];

  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // Body accents follow the scheme; crown accents never do — the crown is ink in
  // light and black in dark, so it always needs the dark-tuned triplet.
  const pa = personaAccent(persona, scheme);
  const pc = personaAccent(persona, 'dark');

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

  // Resume plumbing. Nothing is written until the stored checkpoint has been
  // read back — an early write would overwrite the very progress we're about to
  // restore with this screen's empty initial state.
  const [hydrated, setHydrated] = useState(false);
  const endedRef = useRef(false);          // finished or explicitly abandoned
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistAt = useRef(0);
  const snapshotRef = useRef<ActiveSession | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // Restore silently on mount: same program day → the logged sets and the
  // original start time come back, so elapsed time keeps counting from when the
  // lifter actually started rather than from when they walked back in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getActiveSession();
      if (cancelled) {
        return;
      }
      if (!stored) {
        // Nothing to come back to — clear any chip left over from a session that
        // went stale or was killed with the app.
        void hideSessionNotification();
      } else if (stored.programId === resolvedProgramId && stored.dayIndex === resolvedDayIndex) {
        if (stored.startedAt > 0 && stored.startedAt <= Date.now()) startTime.current = stored.startedAt;
        setSets((prev) =>
          prev.map((rows, exIdx) => {
            const saved = stored.setsLogged[workout.exercises[exIdx]?.name ?? ''];
            if (!Array.isArray(saved)) return rows;
            // Set COUNT comes from the current volume modifier, not from storage:
            // extra saved rows are dropped, missing ones stay blank.
            return rows.map((row, setIdx) => {
              const s = saved[setIdx] as Partial<SetEntry> | undefined;
              if (!s || typeof s !== 'object') return row;
              return {
                weight: typeof s.weight === 'string' ? s.weight : row.weight,
                reps: typeof s.reps === 'string' ? s.reps : row.reps,
                rpe: typeof s.rpe === 'string' ? s.rpe : row.rpe,
                done: s.done === true,
              };
            });
          }),
        );
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coach speaks once when the session opens (after voice prefs load)
  useEffect(() => {
    if (!voice.loaded || startedRef.current) return;
    startedRef.current = true;
    // Guarded by the same ref as the voice cue, so a re-render cannot double-count
    // a session. Pairs with workout_completed to give the finish rate.
    track('workout_started', { program_id: resolvedProgramId, day_index: resolvedDayIndex });
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

    // Logged to the server — the local checkpoint has done its job. Stop
    // persisting before the last render so nothing rewrites it on unmount.
    endedRef.current = true;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    await clearActiveSession();
    await hideSessionNotification();

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

    // Fired here, after the log and sets have actually been written — a
    // "completed" event recorded before the save could outnumber the workouts
    // that really exist.
    track('workout_completed', {
      duration_min: duration,
      volume_kg: Math.round(totalVolume),
      program_id: programId ?? null,
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

  // Explicit abandon. Distinct from simply backing out of the screen: "End"
  // means the lifter is done with this session, so the resume checkpoint and the
  // ongoing chip both go. Backing out any other way keeps them (that's the
  // "Continue your workout" path).
  const abandonSession = async () => {
    endedRef.current = true;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    await clearActiveSession();
    await hideSessionNotification();
    router.back();
  };

  const handleClose = () => {
    const anyDone = sets.flat().some((s) => s.done);
    Alert.alert(
      'End Workout?',
      anyDone ? 'Your workout will not be logged.' : 'Progress will not be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: () => { void abandonSession(); } },
      ]
    );
  };

  const restPct = restTimer !== null ? restTimer / restTotal : 0;
  // The bar GROWS as rest burns down — same direction as the old banner fill.
  const restFillWidth: DimensionValue = `${(1 - restPct) * 100}%`;

  // Display-only derivation: the exercise the lifter is on = the first one with
  // an unlogged set. Nothing reads this back into state.
  const flatSets = sets.flat();
  const doneSetCount = flatSets.filter((s) => s.done).length;
  const totalSetCount = flatSets.length;
  const pendingIdx = sets.findIndex((exSets) => exSets.some((s) => !s.done));
  const currentIdx = pendingIdx === -1 ? Math.max(0, sets.length - 1) : pendingIdx;
  const currentEx = workout.exercises[currentIdx] ?? workout.exercises[0];
  const currentSets = sets[currentIdx] ?? [];
  const pendingSetIdx = currentSets.findIndex((s) => !s.done);
  const currentSetNo = (pendingSetIdx === -1 ? currentSets.length - 1 : pendingSetIdx) + 1;

  const volPct = Math.round((volumeModifier - 1) * 100);
  const volColor = volPct > 0 ? TOKENS.dark.success : TOKENS.dark.warning;

  // Checkpoint after every meaningful change — a set logged, a field edited, the
  // lifter moving to the next exercise. Throttled to one write per
  // PERSIST_THROTTLE_MS with a trailing write, so typing a weight can't turn into
  // a storage write per keystroke while still landing the final value.
  useEffect(() => {
    if (!hydrated || endedRef.current) return;
    const snapshot: ActiveSession = {
      programId: resolvedProgramId,
      dayIndex: resolvedDayIndex,
      startedAt: startTime.current,
      exerciseIndex: currentIdx,
      setsLogged: workout.exercises.reduce<Record<string, unknown>>((acc, ex, i) => {
        // Keyed by exercise NAME so a restore survives a changed set count.
        acc[ex.name] = sets[i] ?? [];
        return acc;
      }, {}),
      volumeModifier,
      lastTouchedAt: Date.now(),
    };
    snapshotRef.current = snapshot;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    const wait = Math.max(0, PERSIST_THROTTLE_MS - (Date.now() - lastPersistAt.current));
    persistTimer.current = setTimeout(() => {
      lastPersistAt.current = Date.now();
      void saveActiveSession(snapshot);
    }, wait);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [
    sets, currentIdx, hydrated, volumeModifier,
    resolvedProgramId, resolvedDayIndex, workout.exercises,
  ]);

  // Keep the status-bar chip pointed at the exercise actually in front of the
  // lifter. onlyAlertOnce means these re-displays stay silent.
  useEffect(() => {
    if (!hydrated || endedRef.current) return;
    void showSessionNotification({
      title: `${currentEx.name} · set ${currentSetNo}/${currentSets.length}`,
      body: `${workout.name} — tap to return to your workout`,
      startedAt: startTime.current,
      accent: pc.accent,
    });
  }, [hydrated, currentEx.name, currentSetNo, currentSets.length, workout.name, pc.accent]);

  // Leaving the screen without finishing is exactly the case this exists for:
  // flush the last snapshot immediately and LEAVE the chip up so the session can
  // be resumed. A finished/abandoned session has already cleared both.
  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    if (endedRef.current) { void hideSessionNotification(); return; }
    if (snapshotRef.current) void saveActiveSession(snapshotRef.current);
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <Crown
        eyebrow={workout.name}
        title={currentEx.name}
        meta={`Set ${currentSetNo} of ${currentSets.length} · target ${currentEx.reps} reps`}
        pills={[
          `EX ${currentIdx + 1}/${workout.exercises.length}`,
          `${currentEx.restSeconds}s rest`,
        ]}
        accent={pc.accent}
        onBack={handleClose}
        right={
          <PressableScale
            onPress={handleFinish}
            disabled={isSaving}
            haptic="heavy"
            accessibilityRole="button"
            accessibilityLabel="Finish workout"
            style={[styles.finishBtn, { backgroundColor: pc.accent }]}
          >
            <Text style={[styles.finishBtnText, { color: pc.ink }]}>
              {isSaving ? 'SAVING' : 'FINISH'}
            </Text>
          </PressableScale>
        }
      >
        {restTimer !== null ? (
          /* Resting: the countdown is the hero — it outranks the exercise title. */
          <View style={styles.restHero}>
            <View style={styles.restTop}>
              <Text style={styles.restLabel}>Resting</Text>
              <PressableScale
                onPress={() => setRestTimer(null)}
                haptic="light"
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Skip rest"
                style={styles.skipBtn}
              >
                <Text style={styles.skipBtnText}>Skip</Text>
              </PressableScale>
            </View>
            <Text style={[styles.restValue, { color: pc.accent }]}>{formatTime(restTimer)}</Text>
            <View style={styles.restTrack}>
              <View style={[styles.restFill, { width: restFillWidth, backgroundColor: pc.accent }]} />
            </View>
          </View>
        ) : (
          <View style={styles.crownStats}>
            <View>
              <Text style={styles.crownStatLabel}>Elapsed</Text>
              <Text style={styles.crownStatValue}>{formatTime(elapsed)}</Text>
            </View>
            <View>
              <Text style={styles.crownStatLabel}>Sets done</Text>
              <Text style={styles.crownStatValue}>{`${doneSetCount}/${totalSetCount}`}</Text>
            </View>
            {volPct !== 0 ? (
              <View style={[styles.volChip, { borderColor: volColor }]}>
                <Text style={[styles.volChipText, { color: volColor }]}>
                  {`Vol ${volPct > 0 ? '+' : ''}${volPct}%`}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </Crown>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Section
            label={`${workout.exercises.length} exercises · ${totalSetCount} sets`}
            style={styles.list}
            contentStyle={styles.listContent}
          >
            {workout.exercises.map((ex, exIdx) => {
              const exSets = sets[exIdx] ?? [];
              const exDone = exSets.length > 0 && exSets.every((s) => s.done);
              const isCurrent = exIdx === currentIdx && !exDone;
              // Drives the Technique chip's label and icon below.
              const covered = hasVisionCoverage(ex.name);
              return (
                <View key={ex.name} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text
                      style={[
                        styles.exIndex,
                        (isCurrent || exDone) && { color: pa.accentText },
                      ]}
                    >
                      {String(exIdx + 1).padStart(2, '0')}
                    </Text>
                    <View style={styles.flex}>
                      <Text style={styles.exName}>{ex.name}</Text>
                      <Text style={styles.exMeta}>
                        {isCurrent
                          ? `Now · ${exSets.length} × ${ex.reps}`
                          : exDone
                            ? `Complete · ${exSets.length} × ${ex.reps}`
                            : `${exSets.length} × ${ex.reps}`}
                      </Text>
                    </View>
                  </View>

                  {ex.tips.length > 0 && (
                    <Text style={styles.exTip}>{ex.tips[0]}</Text>
                  )}

                  <View style={styles.chipRow}>
                    {/* Every exercise opens Technique (key points, then the
                        camera where the engine can honestly judge it). Never
                        hidden: gating on coverage would strip the chip from
                        Rack Pull, the default program's Day-1 opener. The
                        label is the honest claim — "Form" only where a
                        biomechanical profile exists, "Coming soon" elsewhere
                        (the key points still open; only the camera is absent). */}
                    <PressableScale
                      haptic="light"
                      accessibilityRole="button"
                      accessibilityLabel={`${covered ? 'Form check' : 'Form check coming soon'} for ${ex.name}`}
                      style={styles.chip}
                      onPress={() => router.push({ pathname: '/technique', params: { exerciseName: ex.name, persona: programId ?? 'cbum_evolved' } } as any)}
                    >
                      {covered
                        ? <Camera size={13} color={tokens.textSecondary} />
                        : <BookOpen size={13} color={tokens.textSecondary} />}
                      <Text style={[styles.chipText, { color: tokens.textSecondary }]}>{covered ? 'Form' : 'Coming soon'}</Text>
                    </PressableScale>

                  </View>

                  <ExerciseProgression exerciseName={ex.name} reps={ex.reps} />

                  <Hairline style={styles.cardRule} />

                  <View style={styles.setHead}>
                    <Text style={[styles.setHeadCol, styles.colSet]}>Set</Text>
                    <Text style={[styles.setHeadCol, styles.colField]}>Kg</Text>
                    <Text style={[styles.setHeadCol, styles.colField]}>Reps</Text>
                    <Text style={[styles.setHeadCol, styles.colRpe]}>RPE</Text>
                    <View style={styles.colDone} />
                  </View>

                  {exSets.map((s, setIdx) => (
                    <View key={setIdx} style={styles.setRow}>
                      <Text style={[styles.setNum, s.done && { color: pa.accentText }]}>
                        {setIdx + 1}
                      </Text>
                      <TextInput
                        style={[styles.input, styles.colField, s.done && styles.inputDone]}
                        value={s.weight}
                        onChangeText={(v) => updateSet(exIdx, setIdx, 'weight', v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={tokens.textTertiary}
                        editable={!s.done}
                      />
                      <TextInput
                        style={[styles.input, styles.colField, s.done && styles.inputDone]}
                        value={s.reps}
                        onChangeText={(v) => updateSet(exIdx, setIdx, 'reps', v)}
                        keyboardType="number-pad"
                        placeholder={ex.reps}
                        placeholderTextColor={tokens.textTertiary}
                        editable={!s.done}
                      />
                      <TextInput
                        style={[styles.input, styles.colRpe, s.done && styles.inputDone]}
                        value={s.rpe}
                        onChangeText={(v) => updateSet(exIdx, setIdx, 'rpe', v)}
                        keyboardType="decimal-pad"
                        placeholder="7"
                        placeholderTextColor={tokens.textTertiary}
                        editable={!s.done}
                      />
                      {/* Not `disabled` — that washes the completed fill to 50%.
                          The press is a no-op instead, and the haptic goes quiet. */}
                      <PressableScale
                        haptic={s.done ? null : 'heavy'}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: s.done, checked: s.done }}
                        accessibilityLabel={`Complete set ${setIdx + 1} of ${ex.name}`}
                        style={[
                          styles.doneBtn,
                          styles.colDone,
                          // Emerald fill on a light page needs its hairline to be legible.
                          s.done && { backgroundColor: pa.accent, borderColor: pa.accentText, borderWidth: 1 },
                        ]}
                        onPress={() => !s.done && completeSet(exIdx, setIdx, ex.restSeconds)}
                      >
                        {s.done
                          ? <Check size={22} color={pa.ink} strokeWidth={3} />
                          : <View style={styles.doneRing} />
                        }
                      </PressableScale>
                    </View>
                  ))}
                </View>
              );
            })}
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (t: typeof TOKENS.light, scheme: 'light' | 'dark') => StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },

  // ── Crown ──────────────────────────────────────────────────────────────────
  finishBtn: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  finishBtnText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  crownStats: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 30,
    marginTop: 22,
  },
  crownStatLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  crownStatValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 30,
    letterSpacing: -1.35,
    color: t.crownText,
    ...TABULAR,
    marginTop: 4,
  },
  volChip: {
    marginLeft: 'auto',
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  volChipText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  restHero: { marginTop: 20 },
  restTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  skipBtn: {
    borderWidth: 1,
    borderColor: t.crownLine,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  skipBtnText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: t.crownText,
  },
  restValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 66,
    lineHeight: 72,
    // -0.045em at 66px.
    letterSpacing: -2.97,
    ...TABULAR,
    marginTop: 2,
  },
  restTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: t.crownLine,
    overflow: 'hidden',
    marginTop: 10,
  },
  restFill: { height: 3, borderRadius: 2 },

  // ── Body ───────────────────────────────────────────────────────────────────
  content: { paddingHorizontal: 20 },
  list: { marginTop: 24 },
  listContent: { gap: 16 },

  card: {
    backgroundColor: t.surface,
    borderRadius: 26,
    padding: 16,
    // Bold Canvas cards carry no border: on a white page this soft shadow is the
    // only thing separating the card from the ground.
    shadowColor: t.crown,
    shadowOpacity: scheme === 'light' ? 0.07 : 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  exIndex: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: t.textTertiary,
    marginTop: 7,
    width: 22,
  },
  exName: {
    fontFamily: Fonts.displayBold,
    fontSize: 23,
    lineHeight: 27,
    letterSpacing: -1.04,
    color: t.text,
  },
  exMeta: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 7,
  },
  exTip: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: t.textSecondary,
    marginTop: 12,
  },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: t.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  cardRule: { marginTop: 14 },

  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 2 },
  setHeadCol: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    // 0.16em at 8px.
    letterSpacing: 1.28,
    textTransform: 'uppercase',
    color: t.textTertiary,
    textAlign: 'center',
  },
  colSet: { width: 24 },
  colField: { flex: 1 },
  colRpe: { flex: 0.85 },
  colDone: { width: 54 },

  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  setNum: {
    width: 24,
    textAlign: 'center',
    fontFamily: Fonts.displayBold,
    fontSize: 19,
    letterSpacing: -0.6,
    color: t.textTertiary,
    ...TABULAR,
  },
  input: {
    height: 54,
    borderRadius: 19,
    backgroundColor: t.surfaceAlt,
    paddingHorizontal: 4,
    fontFamily: Fonts.displayBold,
    fontSize: 21,
    letterSpacing: -0.7,
    color: t.text,
    textAlign: 'center',
  },
  // A logged set recedes instead of dimming the whole row — the numbers stay
  // readable and the emerald check keeps its punch.
  inputDone: { backgroundColor: 'transparent', color: t.textSecondary },
  doneBtn: {
    height: 54,
    borderRadius: 27,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: t.borderStrong,
  },
});
