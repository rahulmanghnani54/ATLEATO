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
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, type PersonaId } from '@/lib/personaTheme';
import { setupAndroidChannels, type CallKind } from '@/lib/coachCallScheduler';
import {
  scheduleIncomingCall, cancelScheduledCall, ensureExactAlarmPermission,
  ensureNotifeePermission, setupCallChannel,
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

export function useCoachReminders() {
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const personaId: PersonaId = persona.id;

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

    (async () => {
      // Scheduled via Notifee (exact AlarmManager + full-screen call), NOT
      // expo-notifications — the latter silently fails to fire on Android 12+
      // without the exact-alarm permission. This is the fix for "scheduled
      // wake-up / workout call never rings, only Test Now works".
      if (prefs.wakeupEnabled) {
        await scheduleIncomingCall({
          kind: 'wakeup',
          hour: prefs.wakeupHour,
          minute: prefs.wakeupMinute,
          personaId,
        });
      } else {
        await cancelScheduledCall('wakeup');
      }

      if (prefs.workoutEnabled) {
        await scheduleIncomingCall({
          kind: 'workout',
          hour: prefs.workoutHour,
          minute: prefs.workoutMinute,
          personaId,
        });
      } else {
        await cancelScheduledCall('workout');
      }
    })();
  }, [prefs, personaId, loading]);

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
