import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Hard time-limit any Supabase call so a stalled request (flaky network, a slow
// query, or an internal auth-lock wait) can NEVER leave a section spinning
// forever — it rejects, React Query surfaces the error, and the UI shows an
// empty/retry state instead of an infinite loader.
const QUERY_TIMEOUT_MS = 8000;
async function withTimeout<T>(p: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    p as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — check your connection.`)), QUERY_TIMEOUT_MS),
    ),
  ]);
}

export interface WeeklyVolume {
  weekLabel: string; // "Mon Apr 28"
  weekStart: string; // ISO date
  totalVolumeKg: number;
  workoutCount: number;
}

export function useWeeklyVolume(weeks = 8) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['weekly_volume', user?.id, weeks],
    queryFn: async (): Promise<WeeklyVolume[]> => {
      if (!user) return [];
      const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data, error } = await withTimeout(
        supabase
          .from('workout_logs')
          .select('date, total_volume_kg')
          .eq('user_id', user.id)
          .gte('date', since)
          .order('date', { ascending: true }),
        'Weekly volume',
      );

      if (error) throw error;

      // Group by week
      const weekMap = new Map<string, WeeklyVolume>();
      for (const row of (data ?? []) as any[]) {
        const d = new Date(row.date);
        // Get Monday of this week
        const dayOfWeek = d.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(d);
        monday.setDate(d.getDate() - diff);
        const weekStart = monday.toISOString().slice(0, 10);

        if (!weekMap.has(weekStart)) {
          weekMap.set(weekStart, {
            weekStart,
            weekLabel: monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            totalVolumeKg: 0,
            workoutCount: 0,
          });
        }
        const week = weekMap.get(weekStart)!;
        week.totalVolumeKg += row.total_volume_kg ?? 0;
        week.workoutCount++;
      }

      return Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export interface PersonalRecord {
  id: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  oneRepMaxKg: number;
  achievedAt: string;
}

export function usePersonalRecords() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['personal_records', user?.id],
    queryFn: async (): Promise<PersonalRecord[]> => {
      if (!user) return [];
      const { data, error } = await withTimeout(
        supabase
          .from('personal_records')
          .select('*')
          .eq('user_id', user.id)
          .order('one_rep_max_kg', { ascending: false })
          .limit(20),
        'Personal records',
      );

      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        exerciseName: r.exercise_name,
        weightKg: r.weight_kg,
        reps: r.reps,
        oneRepMaxKg: r.one_rep_max_kg,
        achievedAt: r.achieved_at,
      }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export interface Achievement {
  id: string;
  key: string;
  achievedAt: string;
}

const ACHIEVEMENT_META: Record<string, { label: string; emoji: string; description: string }> = {
  first_workout: { label: 'First Workout', emoji: '🎯', description: 'Completed your first workout.' },
  week_streak: { label: '7-Day Streak', emoji: '🔥', description: 'Trained 7 days in a row.' },
  hundred_workouts: { label: 'Century Club', emoji: '💯', description: 'Completed 100 workouts.' },
  tonne_lifted: { label: 'Tonne Club', emoji: '🏋️', description: 'Lifted 1,000kg in a single session.' },
  nutrition_week: { label: 'Nutrition Master', emoji: '🥗', description: 'Logged food 7 days straight.' },
  recovery_streak: { label: 'Recovery Pro', emoji: '😴', description: 'Checked in for 5 consecutive days.' },
  first_pr: { label: 'First PR', emoji: '📈', description: 'Set your first personal record.' },
};

export function useAchievements() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['achievements', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await withTimeout(
        supabase
          .from('user_achievements')
          .select('*')
          .eq('user_id', user.id)
          .order('achieved_at', { ascending: false }),
        'Achievements',
      );

      if (error) throw error;
      return (data ?? []).map((a: any) => ({
        ...ACHIEVEMENT_META[a.achievement_key] ?? { label: a.achievement_key, emoji: '🏅', description: '' },
        id: a.id,
        key: a.achievement_key,
        achievedAt: a.achieved_at,
      }));
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
