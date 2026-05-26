/**
 * Territory hooks
 *
 * Wraps the Supabase RPCs:
 *   - my_territory_stats        → useMyTerritoryStats()
 *   - territory_leaderboard     → useTerritoryLeaderboard()
 *   - claim_cells               → claimCells() (one-shot, used by run tracker)
 *
 * All read hooks degrade silently to empty/zero values if the migration
 * isn't applied yet, so the home card never breaks the UI.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export interface TerritoryStats {
  cells_owned:      number;
  total_runs:       number;
  total_distance_m: number;
  rank:             number;
}

export function useMyTerritoryStats() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['territory_my_stats', user?.id],
    queryFn: async (): Promise<TerritoryStats> => {
      if (!user) return { cells_owned: 0, total_runs: 0, total_distance_m: 0, rank: 0 };
      const { data, error } = await (supabase.rpc as any)('my_territory_stats');
      if (error) {
        if (__DEV__) console.warn('[territory] my_territory_stats:', error.message);
        return { cells_owned: 0, total_runs: 0, total_distance_m: 0, rank: 0 };
      }
      const row = (data ?? [])[0] as TerritoryStats | undefined;
      return row ?? { cells_owned: 0, total_runs: 0, total_distance_m: 0, rank: 0 };
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

export interface TerritoryLeaderRow {
  rank:             number;
  anon_handle:      string;
  cells_owned:      number;
  is_current_user:  boolean;
}

export function useTerritoryLeaderboard(limit = 100) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['territory_leaderboard', limit, user?.id],
    queryFn: async (): Promise<TerritoryLeaderRow[]> => {
      if (!user) return [];
      const { data, error } = await (supabase.rpc as any)('territory_leaderboard', {
        limit_count: limit,
      });
      if (error) {
        if (__DEV__) console.warn('[territory] leaderboard:', error.message);
        return [];
      }
      return (data ?? []) as TerritoryLeaderRow[];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}

export interface ClaimResult {
  cells_total:  number;
  cells_new:    number;
  cells_stolen: number;
  run_id:       string;
}

/** One-shot: post the cell IDs touched by the just-completed run. */
export async function claimCells(
  cellIds: string[],
  distanceMeters: number,
): Promise<ClaimResult> {
  const { data, error } = await (supabase.rpc as any)('claim_cells', {
    p_cell_ids: cellIds,
    p_distance_m: distanceMeters,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as ClaimResult | undefined;
  return row ?? { cells_total: 0, cells_new: 0, cells_stolen: 0, run_id: '' };
}
