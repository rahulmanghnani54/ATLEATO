/**
 * Fetches the user's training dates for the last N days, used by the
 * Chain Calendar (Seinfeld "don't break the chain").
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export function useTrainedDates(daysBack = 180) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['trained_dates', user?.id, daysBack],
    queryFn: async (): Promise<Set<string>> => {
      if (!user) return new Set();
      const since = new Date(Date.now() - daysBack * 86_400_000)
        .toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('workout_logs')
        .select('date')
        .eq('user_id', user.id)
        .gte('date', since);
      if (error || !data) return new Set();
      return new Set(data.map((r: { date: string }) => r.date));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
