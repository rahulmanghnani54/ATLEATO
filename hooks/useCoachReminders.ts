/**
 * useCoachReminders
 *
 * Persists wake-up and workout reminder preferences in AsyncStorage and
 * keeps the scheduled notifications in sync with the user's choices and
 * their selected coach persona.
 *
 * Preferences shape:
 *   wakeupEnabled, wakeupHour, wakeupMinute
 *   workoutEnabled, workoutHour, workoutMinute
 *
 * Whenever a pref changes (or the user switches coach), we cancel the old
 * notification and reschedule with the new time + new persona voice.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, type PersonaId } from '@/lib/personaTheme';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { setupAndroidChannels, type CallKind } from '@/lib/coachCallScheduler';
import {
  scheduleIncomingCall, cancelScheduledCall, ensureExactAlarmPermission,
  ensureNotifeePermission, setupCallChannel, ensureBackgroundCallDelivery,
} from '@/lib/notifeeCallScheduler';
import { AuthorizationStatus } from '@notifee/react-native';

const STORAGE_KEY = 'coachReminders:v1';

export interface ReminderPrefs {
  wakeupEnabled: boolean;
  wakeupHour: number;     // 0-23
  wakeupMinute: number;   // 0-59
  workoutEnabled: boolean;
  workoutHour: number;
  workoutMinute: number;
}

const DEFAULTS: ReminderPrefs = {
  wakeupEnabled: false,
  wakeupHour: 6,
  wakeupMinute: 30,
  workoutEnabled: false,
  workoutHour: 18,
  workoutMinute: 0,
};

// Training weekdays (0=Sun..6=Sat) from a program. undefined = unknown program
// OR trains 7 days → ring every day (safe fallback).
function computeTrainingDays(programKey?: string): number[] | undefined {
  const program = EXPERT_PROGRAMS[programKey ?? ''];
  if (!program) return undefined;
  const set = new Set<number>();
  for (const w of program.schedule) {
    if (w.day < program.daysPerWeek) set.add((w.day + 1) % 7); // program 0=Mon → JS 0=Sun
  }
  return set.size > 0 && set.size < 7 ? [...set] : undefined;
}

// Apply prefs to the OS scheduler for both kinds (shared by the hook + resync).
async function applySchedule(prefs: ReminderPrefs, personaId: PersonaId, trainingDays?: number[]): Promise<void> {
  if (prefs.wakeupEnabled) {
    await scheduleIncomingCall({ kind: 'wakeup', hour: prefs.wakeupHour, minute: prefs.wakeupMinute, personaId, days: trainingDays });
  } else {
    await cancelScheduledCall('wakeup');
  }
  if (prefs.workoutEnabled) {
    await scheduleIncomingCall({ kind: 'workout', hour: prefs.workoutHour, minute: prefs.workoutMinute, personaId, days: trainingDays });
  } else {
    await cancelScheduledCall('workout');
  }
}

/**
 * Reschedule coach calls to match the CURRENT coach + saved prefs WITHOUT being
 * mounted in React. Call on app boot and whenever the user switches coach, so
 * the scheduled call uses the NEW persona (the schedule bakes the persona in at
 * schedule time — without this, switching coach kept the old coach calling).
 * Reads prefs from storage + persona from the auth store.
 */
export async function resyncCoachCalls(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const prefs: ReminderPrefs = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
    const profile = useAuthStore.getState().profile;
    const personaId = personaFromProgramId(profile?.selected_program).id;
    await setupCallChannel();
    await applySchedule(prefs, personaId, computeTrainingDays(profile?.selected_program));
  } catch { /* ignore */ }
}

export function useCoachReminders() {
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const personaId: PersonaId = persona.id;

  // Training weekdays (0=Sun..6=Sat) from the active program, so the coach only
  // rings on training days and NEVER disturbs the user on a rest day. undefined
  // = unknown program → ring every day (safe fallback so calls still fire).
  const trainingDays = useMemo<number[] | undefined>(
    () => computeTrainingDays(profile?.selected_program),
    [profile?.selected_program],
  );

  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  // Load saved prefs once on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await setupAndroidChannels();
        await setupCallChannel();   // notifee channel used by scheduled full-screen calls
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && raw) {
          const parsed = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ReminderPrefs>) };
          setPrefs(parsed);
        }
      } catch {
        // ignore — defaults stand
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /**
   * Apply current prefs to the OS scheduler. Re-runs whenever prefs or
   * persona changes — keeps the scheduled notification text in sync with
   * the active coach.
   */
  useEffect(() => {
    if (loading) return;

    // Scheduled via Notifee (exact AlarmManager + full-screen call). Re-runs on
    // any prefs/persona/trainingDays change to keep the schedule in sync with the
    // active coach. The same applySchedule() also runs globally on coach switch
    // via resyncCoachCalls (see app/_layout.tsx).
    applySchedule(prefs, personaId, trainingDays).catch(() => {});
  }, [prefs, personaId, loading, trainingDays]);

  /** Update one or more preferences and persist to storage. */
  const update = useCallback(async (patch: Partial<ReminderPrefs>) => {
    const merged: ReminderPrefs = { ...prefs, ...patch };

    // If enabling a reminder for the first time, ensure permission is granted
    const enablingAnything =
      (!prefs.wakeupEnabled && patch.wakeupEnabled) ||
      (!prefs.workoutEnabled && patch.workoutEnabled);
    if (enablingAnything) {
      const status = await ensureNotifeePermission();
      const granted =
        status === AuthorizationStatus.AUTHORIZED ||
        status === AuthorizationStatus.PROVISIONAL;
      setPermission(granted ? 'granted' : 'denied');
      if (!granted) {
        // Don't enable a reminder we can't actually deliver
        if (patch.wakeupEnabled)  merged.wakeupEnabled = false;
        if (patch.workoutEnabled) merged.workoutEnabled = false;
      } else {
        // Notifications allowed — also make sure exact alarms are permitted, or
        // the scheduled call won't fire on time (Android 12+). Opens the
        // "Alarms & reminders" settings page if it's currently disabled.
        await ensureExactAlarmPermission();
        // AND exempt the app from battery optimization — Samsung/OEMs kill
        // background alarms otherwise, so scheduled calls silently never fire.
        await ensureBackgroundCallDelivery();
      }
    }

    setPrefs(merged);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }, [prefs]);

  /** Toggle one of the reminders on/off. */
  const toggleWakeup  = useCallback(() => update({ wakeupEnabled:  !prefs.wakeupEnabled  }), [prefs.wakeupEnabled, update]);
  const toggleWorkout = useCallback(() => update({ workoutEnabled: !prefs.workoutEnabled }), [prefs.workoutEnabled, update]);

  /** Set the time for a specific reminder (24h format). */
  const setTime = useCallback((kind: CallKind, hour: number, minute: number) => {
    if (kind === 'wakeup')  return update({ wakeupHour: hour, wakeupMinute: minute });
    if (kind === 'workout') return update({ workoutHour: hour, workoutMinute: minute });
  }, [update]);

  return {
    prefs, loading, permission,
    toggleWakeup, toggleWorkout, setTime,
    persona,
  };
}
