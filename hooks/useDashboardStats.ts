import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import type { WorkoutDay } from '@/constants/experts';

// ── Streak ────────────────────────────────────────────────────────────────────
export function useWorkoutStreak() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['workout_streak', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from('workout_logs')
        .select('date')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(90);

      if (error || !data?.length) return 0;

      const dates = [...new Set(data.map((r: { date: string }) => r.date))].sort().reverse();
      const today = new Date().toISOString().slice(0, 10);

      // Start counting: if no workout today, start from yesterday
      let streak = 0;
      let expected = dates[0] >= today ? today : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
      })();

      for (const date of dates) {
        if (date === expected) {
          streak++;
          const d = new Date(expected);
          d.setDate(d.getDate() - 1);
          expected = d.toISOString().slice(0, 10);
        } else if (date < expected) {
          break;
        }
      }
      return streak;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
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

      const { data, error } = await supabase
        .from('workout_logs')
        .select('total_volume_kg')
        .eq('user_id', user.id)
        .gte('date', since);

      if (error) return 0;
      const total = (data ?? []).reduce((sum: number, r: { total_volume_kg: number | null }) => sum + (r.total_volume_kg ?? 0), 0);
      return Math.round(total / 100) / 10; // → e.g. 12.4 (k kg)
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Today's workout + upcoming schedule ──────────────────────────────────────
export interface DaySchedule {
  dayLabel: string;   // e.g. "WED"
  name: string;       // e.g. "PULL · 1"
  isRest: boolean;
  isToday: boolean;
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
        const workout = program.schedule.find((w) => w.day === programDay) ?? null;
        const isRest = !workout || programDay >= program.daysPerWeek;

        days.push({
          dayLabel: DAY_NAMES[dow],
          name: isRest ? 'REST' : workout!.name.toUpperCase(),
          isRest,
          isToday: offset === 0,
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
