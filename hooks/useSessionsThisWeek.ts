/**
 * Count of distinct training days the user has logged THIS week (Mon → Sun).
 * Used by WitnessNudgeCard to decide whether the user is behind their commitment.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export function useSessionsThisWeek() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['sessions_this_week', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      // Start of week (Monday) in YYYY-MM-DD
      const now = new Date();
      const dow = (now.getDay() + 6) % 7;       // Mon = 0
      const monday = new Date(now);
      monday.setDate(now.getDate() - dow);
      const fromISO = monday.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('workout_logs')
        .select('date')
        .eq('user_id', user.id)
        .gte('date', fromISO);
      if (error || !data) return 0;
      const unique = new Set(data.map((r: { date: string }) => r.date));
      return unique.size;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
