/**
 * useStreakFreezes — React Query hook exposing the user's current freeze inventory.
 *
 * Re-queries every 30 seconds so changes (earned or consumed by useWorkoutStreak)
 * surface in the UI without manual invalidation.
 */
import { useQuery } from '@tanstack/react-query';
import { getFreezeState, MAX_FREEZES } from '@/lib/streakFreezes';

export function useStreakFreezes() {
  const q = useQuery({
    queryKey: ['streak_freezes'],
    queryFn: async () => {
      const state = await getFreezeState();
      return { freezes: state.freezes, frozenDates: state.frozenDates };
    },
    staleTime: 10 * 1000, // 10s — keeps UI fresh after earn/consume
    refetchInterval: 30 * 1000,
  });

  return {
    freezes: q.data?.freezes ?? 0,
    frozenDates: q.data?.frozenDates ?? [],
    maxFreezes: MAX_FREEZES,
  };
}
