/**
 * Did the user log a workout today?
 * Used by the StreakHero + miss-day nudge logic.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export function useTrainedToday() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['trained_today', user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .limit(1);
      return !error && !!data && data.length > 0;
    },
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute — refetch quickly after logging
  });
}
