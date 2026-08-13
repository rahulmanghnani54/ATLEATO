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

// Time-limit any Supabase call so a stalled request can't leave a dashboard
// stat spinning forever (same pattern as useDashboardStats / useProgressStats).
async function withTimeout<T>(p: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    p as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — check your connection.`)), 8000),
    ),
  ]);
}

export interface LeaderboardRow {
  rank:             number;
  anon_handle:      string;
  volume_kg:        number;
  sessions:         number;
  is_current_user:  boolean;
}

// The RPC ships in migration 006 and isn't in the generated Database types, so
// describe just this call rather than widening the client (which erased the
// result type and left `data`/`error` as `unknown`).
type LeaderboardRpc = (
  fn: 'global_weekly_leaderboard',
  args: { limit_count: number },
) => PromiseLike<{ data: LeaderboardRow[] | null; error: { message: string } | null }>;

const leaderboardRpc = supabase.rpc as unknown as LeaderboardRpc;

export function useGlobalLeaderboard(limit = 100) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['global_leaderboard', limit, user?.id],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      if (!user) return [];
      // A stall must resolve, not hang — both the leaderboard screen and the
      // dashboard card gate their whole list on this query's pending state.
      const { data, error } = await withTimeout(
        leaderboardRpc('global_weekly_leaderboard', { limit_count: limit }),
        'Leaderboard',
      ).catch((e: Error) => ({ data: null, error: e }));
      if (error) {
        // Most likely cause: migration 006 not yet applied → silently empty
        if (__DEV__) console.warn('[leaderboard] rpc error:', error.message);
        return [];
      }
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 60 * 1000,   // 1 min — leaderboard moves but not constantly
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
