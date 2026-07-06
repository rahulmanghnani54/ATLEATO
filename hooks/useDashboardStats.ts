import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Time-limit any Supabase call so a stalled request can't leave a dashboard
// stat spinning forever (same pattern as useProgressStats).
async function withTimeout<T>(p: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    p as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — check your connection.`)), 8000),
    ),
  ]);
}
import { EXPERT_PROGRAMS } from '@/constants/experts';
import type { WorkoutDay } from '@/constants/experts';
import {
  consumeFreezeForDate, checkAndAwardFreeze, getFreezeState, resetFrozenDates,
} from '@/lib/streakFreezes';

// ── Streak (now freeze-aware) ─────────────────────────────────────────────────
//
// Walks the user's training history backward from today. For each MISSED day:
//   - If a freeze was previously applied to that date → streak continues
//   - Else if a freeze is available → consume one, streak continues
//   - Else → streak breaks
//
// After computing, awards a freeze if user crossed a new 7-day milestone.
export function useWorkoutStreak() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['workout_streak', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { data, error } = await withTimeout(
        supabase
          .from('workout_logs')
          .select('date')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(90),
        'Streak',
      );

      if (error || !data?.length) return 0;

      // Set of dates the user trained — O(1) lookup
      const trainedDates = new Set<string>(
        data.map((r: { date: string }) => r.date),
      );
      const today = new Date().toISOString().slice(0, 10);

      // Cursor: today if trained today, else yesterday
      const cursor = new Date();
      if (!trainedDates.has(today)) cursor.setDate(cursor.getDate() - 1);

      // BUG-FIX (stats keeps loading): previously did up to 180 sequential
      // AsyncStorage reads (isFrozen + consumeFreezeForDate per missed day).
      // On a cold cache that's 10+ seconds spinning. Read frozen-dates ONCE
      // into a Set, check synchronously inside the loop, only call the async
      // consume when we actually need to spend a freeze.
      const freezeState = await getFreezeState();
      const frozenSet = new Set<string>(freezeState.frozenDates);

      let streak = 0;
      for (let i = 0; i < 90; i++) {
        const dateISO = cursor.toISOString().slice(0, 10);

        if (trainedDates.has(dateISO)) {
          streak++;
        } else if (frozenSet.has(dateISO)) {
          // Already-frozen day — streak continues but does NOT increment
        } else {
          // Missed AND not already frozen — try to spend a freeze
          const used = await consumeFreezeForDate(dateISO);
          if (!used) break; // no freeze available → streak ends here
          frozenSet.add(dateISO); // keep loop state in sync with disk
        }
        cursor.setDate(cursor.getDate() - 1);
      }

      if (streak === 0) {
        // Streak fully broke — clear old frozen-dates so they don't carry over
        await resetFrozenDates();
      } else {
        // Check if we just earned a new freeze
        await checkAndAwardFreeze(streak);
      }

      return streak;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ── This-week volume ──────────────────────────────────────────────────────────
export function useThisWeekVolume() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['week_volume_current', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      // Get Monday of this week
      const now = new Date();
      const dow = now.getDay(); // 0=Sun
      const diffToMon = dow === 0 ? 6 : dow - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMon);
      const since = monday.toISOString().slice(0, 10);

      const { data, error } = await withTimeout(
        supabase
          .from('workout_logs')
          .select('total_volume_kg')
          .eq('user_id', user.id)
          .gte('date', since),
        'Week volume',
      );

      if (error) return 0;
      const total = (data ?? []).reduce((sum: number, r: { total_volume_kg: number | null }) => sum + (r.total_volume_kg ?? 0), 0);
      return Math.round(total / 100) / 10; // → e.g. 12.4 (k kg)
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ── Today's workout + upcoming schedule ──────────────────────────────────────
export interface DaySchedule {
  dayLabel: string;   // e.g. "WED"
  name: string;       // e.g. "PULL · 1"
  isRest: boolean;
  isToday: boolean;
  dayIndex: number;   // ARRAY index into program.schedule — the lobby/session
                      // address workouts by array position, so callers must pass
                      // this (not the weekday) or the lobby shows the wrong day.
  workout: WorkoutDay | null;
}

export function useProgramSchedule() {
  const profile = useAuthStore((s) => s.profile);

  return useQuery({
    queryKey: ['program_schedule', profile?.selected_program, profile?.id],
    queryFn: (): DaySchedule[] => {
      const programId = profile?.selected_program ?? 'cbum_evolved';
      const program = EXPERT_PROGRAMS[programId];
      if (!program) return [];

      const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const today = new Date();

      // Build schedule for today + next 4 days
      const days: DaySchedule[] = [];
      for (let offset = 0; offset < 5; offset++) {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        const dow = d.getDay(); // 0=Sun
        // Program uses 0=Mon mapping, convert Sun→6, Mon→0, etc.
        const programDay = dow === 0 ? 6 : dow - 1;
        const wIdx = program.schedule.findIndex((w) => w.day === programDay);
        const workout = wIdx >= 0 ? program.schedule[wIdx] : null;
        const isRest = !workout || programDay >= program.daysPerWeek;

        days.push({
          dayLabel: DAY_NAMES[dow],
          name: isRest ? 'REST' : workout!.name.toUpperCase(),
          isRest,
          isToday: offset === 0,
          dayIndex: wIdx,
          workout: isRest ? null : (workout ?? null),
        });
      }
      return days;
    },
    enabled: !!profile,
    staleTime: 60 * 60 * 1000, // 1 hour — program doesn't change often
  });
}

// ── Program week number (weeks since account creation) ───────────────────────
export function useProgramWeek() {
  const profile = useAuthStore((s) => s.profile);

  if (!profile) return 1;
  // Use created_at field from profile
  const createdAt = (profile as any).created_at;
  if (!createdAt) return 1;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const week = Math.floor((Date.now() - new Date(createdAt).getTime()) / msPerWeek) + 1;
  return Math.min(week, 52); // cap at 52
}
