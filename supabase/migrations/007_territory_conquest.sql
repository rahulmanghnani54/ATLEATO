-- ─────────────────────────────────────────────────────────────────────────────
-- Territory Conquest — Splatoon-meets-Strava
--
-- Whoever runs through a 200m grid cell most recently OWNS it. Anyone who
-- runs through the same cell later steals it from them. Global leaderboard
-- ranks users by total cells owned right now.
--
-- Tables:
--   territory_cells     — current ownership of every cell ever claimed
--   territory_runs      — each run a user logged (for history / anti-cheat)
--
-- RPCs:
--   claim_cells(cell_ids text[], distance_m numeric)
--                       — atomically capture a set of cells and record the run
--   territory_leaderboard(limit_count int)
--                       — top N users by cells currently owned + caller's rank
--
-- All RPCs are SECURITY DEFINER so authenticated clients can mutate without
-- needing direct row access to other users' territories.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.territory_cells (
  cell_id     TEXT PRIMARY KEY,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS territory_cells_owner_idx
  ON public.territory_cells (owner_id);

CREATE TABLE IF NOT EXISTS public.territory_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  distance_m      NUMERIC NOT NULL CHECK (distance_m >= 0),
  cells_claimed   INT NOT NULL CHECK (cells_claimed >= 0),
  cells_stolen    INT NOT NULL DEFAULT 0 CHECK (cells_stolen >= 0),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS territory_runs_user_started_idx
  ON public.territory_runs (user_id, started_at DESC);

-- RLS — locked down. All mutation/read goes through SECURITY DEFINER RPCs.
ALTER TABLE public.territory_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territory_runs  ENABLE ROW LEVEL SECURITY;

-- Users can READ their own runs (for personal history later)
DROP POLICY IF EXISTS territory_runs_own_select ON public.territory_runs;
CREATE POLICY territory_runs_own_select
  ON public.territory_runs FOR SELECT
  USING (auth.uid() = user_id);

-- ── RPC: claim_cells ────────────────────────────────────────────────────────
-- Upserts ownership for every cell_id passed in. Returns the count of cells
-- that were NEWLY claimed (i.e. were owned by someone else before, or
-- previously unowned).
CREATE OR REPLACE FUNCTION public.claim_cells(
  p_cell_ids   TEXT[],
  p_distance_m NUMERIC
)
RETURNS TABLE (
  cells_total    INT,
  cells_new      INT,
  cells_stolen   INT,
  run_id         UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  caller_id      UUID := auth.uid();
  v_run_id       UUID;
  v_cells_new    INT  := 0;
  v_cells_stolen INT  := 0;
  v_total        INT  := COALESCE(array_length(p_cell_ids, 1), 0);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF v_total = 0 THEN
    -- Empty run — still log it but don't touch territory
    INSERT INTO public.territory_runs (user_id, distance_m, cells_claimed, cells_stolen)
    VALUES (caller_id, p_distance_m, 0, 0)
    RETURNING id INTO v_run_id;
    RETURN QUERY SELECT 0, 0, 0, v_run_id;
    RETURN;
  END IF;

  -- Count cells we're about to STEAL from another owner (vs unowned / already mine)
  SELECT COUNT(*)::INT INTO v_cells_stolen
  FROM public.territory_cells
  WHERE cell_id = ANY(p_cell_ids)
    AND owner_id <> caller_id;

  -- Count cells that will be NEW to us (currently owned by someone else OR unowned)
  WITH already_owned AS (
    SELECT cell_id FROM public.territory_cells
    WHERE cell_id = ANY(p_cell_ids) AND owner_id = caller_id
  )
  SELECT (v_total - COUNT(*))::INT INTO v_cells_new FROM already_owned;

  -- Upsert ownership — caller is the new owner of every passed cell
  INSERT INTO public.territory_cells (cell_id, owner_id, claimed_at)
  SELECT unnest(p_cell_ids), caller_id, NOW()
  ON CONFLICT (cell_id) DO UPDATE
    SET owner_id   = EXCLUDED.owner_id,
        claimed_at = EXCLUDED.claimed_at;

  -- Log the run
  INSERT INTO public.territory_runs
    (user_id, distance_m, cells_claimed, cells_stolen)
  VALUES
    (caller_id, p_distance_m, v_cells_new, v_cells_stolen)
  RETURNING id INTO v_run_id;

  RETURN QUERY SELECT v_total, v_cells_new, v_cells_stolen, v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cells(TEXT[], NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_cells(TEXT[], NUMERIC) TO authenticated;

-- ── RPC: territory_leaderboard ──────────────────────────────────────────────
-- Top N users by cells currently owned, with anonymous handles and the
-- caller's rank pinned even if outside the top window.
CREATE OR REPLACE FUNCTION public.territory_leaderboard(
  limit_count INT DEFAULT 100
)
RETURNS TABLE (
  rank             BIGINT,
  anon_handle      TEXT,
  cells_owned      BIGINT,
  is_current_user  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT owner_id AS uid, COUNT(*)::BIGINT AS owned
    FROM public.territory_cells
    GROUP BY owner_id
  ),
  ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY owned DESC) AS rnk,
      uid, owned
    FROM agg
  )
  SELECT
    r.rnk                                                                          AS rank,
    'Lifter #' || LPAD(((ABS(HASHTEXT(r.uid::TEXT)) % 9000) + 1000)::TEXT, 4, '0') AS anon_handle,
    r.owned                                                                        AS cells_owned,
    (r.uid = caller_id)                                                            AS is_current_user
  FROM ranked r
  WHERE r.rnk <= limit_count
     OR r.uid = caller_id
  ORDER BY r.rnk ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.territory_leaderboard(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.territory_leaderboard(INT) TO authenticated;

-- ── RPC: my_territory_stats ─────────────────────────────────────────────────
-- Quick lookup for the home card: cells owned + total runs + total distance
CREATE OR REPLACE FUNCTION public.my_territory_stats()
RETURNS TABLE (
  cells_owned      BIGINT,
  total_runs       BIGINT,
  total_distance_m NUMERIC,
  rank             BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  caller_id UUID := auth.uid();
  v_cells   BIGINT;
  v_runs    BIGINT;
  v_dist    NUMERIC;
  v_rank    BIGINT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT COUNT(*) INTO v_cells
  FROM public.territory_cells WHERE owner_id = caller_id;

  SELECT COUNT(*), COALESCE(SUM(distance_m), 0)
  INTO v_runs, v_dist
  FROM public.territory_runs WHERE user_id = caller_id;

  SELECT rnk INTO v_rank FROM (
    SELECT owner_id, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rnk
    FROM public.territory_cells GROUP BY owner_id
  ) r WHERE r.owner_id = caller_id;

  RETURN QUERY SELECT v_cells, v_runs, v_dist, COALESCE(v_rank, 0::BIGINT);
END;
$$;

REVOKE ALL ON FUNCTION public.my_territory_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_territory_stats() TO authenticated;
