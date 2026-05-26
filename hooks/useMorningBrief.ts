/**
 * Morning Brief
 *
 * Tiny daily ritual on the home screen — coach asks two questions:
 *   1. How did you sleep?  (rough / ok / great)
 *   2. What's the intent?  (push / steady / light)
 *
 * The combination produces a `volumeModifier` (0.70 .. 1.20) that flows into
 * workout-lobby via the existing `recovery_checkin.volume_modifier` field.
 * No downstream refactor — workout-lobby already reads that value.
 *
 * Stored in AsyncStorage under `morningBrief:YYYY-MM-DD` so it resets every day.
 * Also persisted to the `recovery_checkins` table (one row per user per day).
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export type SleepQuality = 'rough' | 'ok' | 'great';
export type Intent = 'push' | 'steady' | 'light';

export interface MorningBrief {
  sleep: SleepQuality;
  intent: Intent;
  modifier: number;       // 0.70 .. 1.20
  savedAt: string;        // ISO
}

const STORAGE_PREFIX = 'morningBrief:';

const todayKey = () => `${STORAGE_PREFIX}${format(new Date(), 'yyyy-MM-dd')}`;

/** Compute a recovery-adjusted volume modifier from (sleep × intent). */
export function computeVolumeModifier(sleep: SleepQuality, intent: Intent): number {
  // Base modifier from sleep
  const sleepBase = { rough: 0.85, ok: 1.00, great: 1.10 }[sleep];
  // Intent multiplier on top
  const intentMult = { light: 0.85, steady: 1.00, push: 1.10 }[intent];
  const raw = sleepBase * intentMult;
  // Cap to safe range — never below 0.70 (less injury risk), never above 1.20 (recovery limit)
  return Math.max(0.70, Math.min(1.20, Math.round(raw * 100) / 100));
}

/** Short human label for the resulting recommendation. */
export function describeBrief(brief: MorningBrief): string {
  const sleepLabel = { rough: 'Tired', ok: 'Rested', great: 'Charged' }[brief.sleep];
  const intentLabel = { light: 'Light Day', steady: 'Steady Day', push: 'Heavy Push' }[brief.intent];
  return `${sleepLabel} · ${intentLabel}`;
}

/** Plain-English coach recommendation paragraph. */
export function briefAdvice(brief: MorningBrief): string {
  if (brief.modifier >= 1.10) return 'Green light to load — push your top sets.';
  if (brief.modifier >= 1.00) return 'Normal session — execute the plan.';
  if (brief.modifier >= 0.85) return 'Pull back 10-15%. Protect form over volume.';
  return 'Deload mode — light, technique-focused, you grow from this.';
}

export function useMorningBrief() {
  const userId = useAuthStore((s) => s.user?.id);
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [loading, setLoading] = useState(true);

  // Load on mount + cleanup yesterday's keys
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Clean up old morning-brief entries (keep storage tidy)
        const allKeys = await AsyncStorage.getAllKeys();
        const stale = allKeys.filter((k) => k.startsWith(STORAGE_PREFIX) && k !== todayKey());
        if (stale.length > 0) await AsyncStorage.multiRemove(stale);

        const raw = await AsyncStorage.getItem(todayKey());
        if (alive && raw) {
          setBrief(JSON.parse(raw) as MorningBrief);
        }
      } catch {
        // ignore — brief stays null
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = useCallback(async (sleep: SleepQuality, intent: Intent) => {
    const modifier = computeVolumeModifier(sleep, intent);
    const next: MorningBrief = { sleep, intent, modifier, savedAt: new Date().toISOString() };
    setBrief(next);
    // Local cache (instant, offline-safe)
    await AsyncStorage.setItem(todayKey(), JSON.stringify(next));

    // Mirror into recovery_checkins so workout-lobby picks it up.
    // We translate sleep → an approximate recovery score so existing UI keeps working.
    if (userId) {
      const sleepScore = { rough: 45, ok: 70, great: 88 }[sleep];
      const today = format(new Date(), 'yyyy-MM-dd');
      try {
        await (supabase.from('recovery_checkins') as any).upsert(
          {
            user_id: userId,
            date: today,
            sleep_hours: sleep === 'great' ? 8 : sleep === 'ok' ? 7 : 5.5,
            recovery_score: sleepScore,
            volume_modifier: modifier,
            notes: `morning_brief:${sleep}:${intent}`,
          },
          { onConflict: 'user_id,date' },
        );
      } catch {
        // Network failure is OK — local cache still drives the UI for today.
      }
    }
    return next;
  }, [userId]);

  /** Wipe today's brief and start over (for testing or manual reset). */
  const reset = useCallback(async () => {
    await AsyncStorage.removeItem(todayKey());
    setBrief(null);
  }, []);

  return { brief, loading, save, reset, isDone: brief != null };
}
