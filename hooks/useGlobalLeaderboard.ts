/**
 * useGlobalLeaderboard — top weekly lifters via the SECURITY DEFINER RPC.
 *
 * Graceful fallback: if the RPC doesn't exist yet (migration 006 not applied),
 * returns an empty list rather than erroring. The UI shows a "leaderboard
 * loading" state in that case.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export interface LeaderboardRow {
  rank:             number;
  anon_handle:      string;
  volume_kg:        number;
  sessions:         number;
  is_current_user:  boolean;
}

export function useGlobalLeaderboard(limit = 100) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['global_leaderboard', limit, user?.id],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      if (!user) return [];
      const { data, error } = await (supabase.rpc as any)(
        'global_weekly_leaderboard',
        { limit_count: limit },
      );
      if (error) {
        // Most likely cause: migration 006 not yet applied → silently empty
        if (__DEV__) console.warn('[leaderboard] rpc error:', error.message);
        return [];
      }
      return (data ?? []) as LeaderboardRow[];
    },
    enabled: !!user,
    staleTime: 60 * 1000,   // 1 min — leaderboard moves but not constantly
    refetchOnWindowFocus: true,
  });
}
