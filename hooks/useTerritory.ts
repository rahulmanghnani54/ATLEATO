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

// ── Map viewport hook ────────────────────────────────────────────────────────

export interface CellInBbox {
  cell_id:         string;
  is_current_user: boolean;
  anon_handle:     string;
  claimed_at:      string;
  change_count:    number;   // # of times this cell has switched owners
}

export interface BBox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

/**
 * Cells whose SW corner lies inside the requested viewport.
 * Caller is expected to debounce / quantise the bbox so we don't refetch
 * on every map pan frame — query key is rounded to 0.005° (~500m).
 */
export function useCellsInBbox(bbox: BBox | null, limit = 800) {
  const user = useAuthStore((s) => s.user);
  // Quantise the bbox so small pans don't refetch
  const key = bbox
    ? [
        Math.round(bbox.latMin * 200) / 200,
        Math.round(bbox.latMax * 200) / 200,
        Math.round(bbox.lonMin * 200) / 200,
        Math.round(bbox.lonMax * 200) / 200,
      ]
    : null;

  return useQuery({
    queryKey: ['cells_in_bbox', user?.id, key, limit],
    queryFn: async (): Promise<CellInBbox[]> => {
      if (!user || !bbox) return [];
      const { data, error } = await (supabase.rpc as any)('cells_in_bbox', {
        p_lat_min: bbox.latMin,
        p_lat_max: bbox.latMax,
        p_lon_min: bbox.lonMin,
        p_lon_max: bbox.lonMax,
        p_limit:   limit,
      });
      if (error) {
        if (__DEV__) console.warn('[territory] cells_in_bbox:', error.message);
        return [];
      }
      return (data ?? []) as CellInBbox[];
    },
    enabled: !!user && !!bbox,
    staleTime: 15 * 1000,
  });
}

// ── Nearby ("city") leaderboard ──────────────────────────────────────────────

/**
 * Top users among everyone who owns at least one cell inside the bbox.
 * Useful for "your city" rankings; pass a ~0.1° (~10km) bbox around the
 * caller's location.
 */
export function useNearbyLeaderboard(bbox: BBox | null, limit = 50) {
  const user = useAuthStore((s) => s.user);
  const key = bbox
    ? [
        Math.round(bbox.latMin * 50) / 50,
        Math.round(bbox.latMax * 50) / 50,
        Math.round(bbox.lonMin * 50) / 50,
        Math.round(bbox.lonMax * 50) / 50,
      ]
    : null;

  return useQuery({
    queryKey: ['nearby_leaderboard', user?.id, key, limit],
    queryFn: async (): Promise<TerritoryLeaderRow[]> => {
      if (!user || !bbox) return [];
      const { data, error } = await (supabase.rpc as any)('nearby_leaderboard', {
        p_lat_min: bbox.latMin,
        p_lat_max: bbox.latMax,
        p_lon_min: bbox.lonMin,
        p_lon_max: bbox.lonMax,
        limit_count: limit,
      });
      if (error) {
        if (__DEV__) console.warn('[territory] nearby_leaderboard:', error.message);
        return [];
      }
      return (data ?? []) as TerritoryLeaderRow[];
    },
    enabled: !!user && !!bbox,
    staleTime: 60 * 1000,
  });
}

// ── Push token registration ──────────────────────────────────────────────────

/**
 * Register the caller's Expo push token so the notify_steal edge function
 * can deliver "Lifter #4729 took your park" alerts. Safe to call repeatedly
 * (upserts on user_id).
 */
export async function upsertPushToken(
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  const { error } = await (supabase.rpc as any)('upsert_push_token', {
    p_token: token,
    p_platform: platform,
  });
  if (error) throw error;
}
