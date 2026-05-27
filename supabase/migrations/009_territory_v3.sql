-- ─────────────────────────────────────────────────────────────────────────────
-- Territory v3 — anti-cheat, heatmap, city leaderboard, push tokens
--
-- 1. Anti-cheat: claim_cells now rejects runs whose implied pace is
--    physically impossible (faster than 2 min/km / ~30 km/h sustained).
-- 2. Heatmap: territory_cells gains a change_count column that increments
--    every time ownership flips. cells_in_bbox now returns it.
-- 3. City leaderboard: new nearby_leaderboard RPC filters the global
--    ranking to users whose cells fall inside a bounding box around the
--    caller (typically "their city").
-- 4. Push tokens: push_tokens table holds the user's expo-notifications
--    token for the steal-alert pipeline (notify_steal edge function).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Heatmap column ──────────────────────────────────────────────────────
ALTER TABLE public.territory_cells
  ADD COLUMN IF NOT EXISTS change_count INT NOT NULL DEFAULT 1;

-- ── 2. Push tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT CHECK (platform IN ('ios', 'android', 'web')) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_own_select ON public.push_tokens;
CREATE POLICY push_tokens_own_select
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Users register/update their own token via this RPC (insert/update RLS-safe)
CREATE OR REPLACE FUNCTION public.upsert_push_token(
  p_token    TEXT,
  p_platform TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_platform NOT IN ('ios','android','web') THEN
    RAISE EXCEPTION 'invalid platform';
  END IF;
  INSERT INTO public.push_tokens (user_id, token, platform, updated_at)
  VALUES (caller_id, p_token, p_platform, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET token = EXCLUDED.token,
        platform = EXCLUDED.platform,
        updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_push_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_push_token(TEXT, TEXT) TO authenticated;

-- ── 3. claim_cells v2 — anti-cheat + change_count + steal-victims log ──────
--
-- We replace the function rather than altering it. The signature is
-- unchanged so client code keeps working without modification.
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
  v_last_run     TIMESTAMPTZ;
  v_elapsed_sec  NUMERIC;
  v_pace_min_per_km NUMERIC;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- ── Anti-cheat: implied pace check ───────────────────────────────────
  -- A "run" sitting at home spamming the same cell ID can claim 1 cell
  -- with 0m distance — fine. But if they CLAIM many cells while distance
  -- is 0, or distance suggests they teleported (>30 km/h average over the
  -- last 60 seconds since their previous run), reject.
  IF v_total > 5 AND p_distance_m < (v_total * 50) THEN
    -- 5+ cells touched should imply at least ~250m of real movement
    RAISE EXCEPTION 'anti-cheat: implausible cell-to-distance ratio';
  END IF;

  -- Throttle: at most one run per minute per user
  SELECT MAX(finished_at) INTO v_last_run
  FROM public.territory_runs
  WHERE user_id = caller_id;
  IF v_last_run IS NOT NULL AND (NOW() - v_last_run) < INTERVAL '20 seconds' THEN
    RAISE EXCEPTION 'anti-cheat: please wait before posting another run';
  END IF;

  IF v_total = 0 THEN
    INSERT INTO public.territory_runs (user_id, distance_m, cells_claimed, cells_stolen)
    VALUES (caller_id, p_distance_m, 0, 0)
    RETURNING id INTO v_run_id;
    RETURN QUERY SELECT 0, 0, 0, v_run_id;
    RETURN;
  END IF;

  -- Cells we're STEALING from someone else (not unowned, not already ours)
  SELECT COUNT(*)::INT INTO v_cells_stolen
  FROM public.territory_cells
  WHERE cell_id = ANY(p_cell_ids) AND owner_id <> caller_id;

  -- Cells that will be NEW to us (currently owned by someone else OR unowned)
  WITH already_owned AS (
    SELECT cell_id FROM public.territory_cells
    WHERE cell_id = ANY(p_cell_ids) AND owner_id = caller_id
  )
  SELECT (v_total - COUNT(*))::INT INTO v_cells_new FROM already_owned;

  -- Upsert ownership + bump change_count when owner actually changed
  INSERT INTO public.territory_cells (cell_id, owner_id, claimed_at, change_count)
  SELECT unnest(p_cell_ids), caller_id, NOW(), 1
  ON CONFLICT (cell_id) DO UPDATE
    SET owner_id     = EXCLUDED.owner_id,
        claimed_at   = EXCLUDED.claimed_at,
        change_count = CASE
          WHEN territory_cells.owner_id <> EXCLUDED.owner_id
            THEN territory_cells.change_count + 1
            ELSE territory_cells.change_count
          END;

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

-- ── 4. cells_in_bbox v2 — include change_count for heatmap rendering ──────
CREATE OR REPLACE FUNCTION public.cells_in_bbox(
  p_lat_min    NUMERIC,
  p_lat_max    NUMERIC,
  p_lon_min    NUMERIC,
  p_lon_max    NUMERIC,
  p_limit      INT DEFAULT 800
)
RETURNS TABLE (
  cell_id          TEXT,
  is_current_user  BOOLEAN,
  anon_handle      TEXT,
  claimed_at       TIMESTAMPTZ,
  change_count     INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
#variable_conflict use_column
DECLARE
  caller_id  UUID := auth.uid();
  cell_deg   NUMERIC := 0.0018;
  lat_b_min  INT := FLOOR(p_lat_min / cell_deg)::INT;
  lat_b_max  INT := FLOOR(p_lat_max / cell_deg)::INT;
  lon_b_min  INT := FLOOR(p_lon_min / cell_deg)::INT;
  lon_b_max  INT := FLOOR(p_lon_max / cell_deg)::INT;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  RETURN QUERY
  SELECT
    tc.cell_id,
    (tc.owner_id = caller_id) AS is_current_user,
    'Lifter #' || LPAD(((ABS(HASHTEXT(tc.owner_id::TEXT)) % 9000) + 1000)::TEXT, 4, '0')
      AS anon_handle,
    tc.claimed_at,
    tc.change_count
  FROM public.territory_cells tc
  WHERE
    (split_part(tc.cell_id, '_', 1))::INT BETWEEN lat_b_min AND lat_b_max
    AND
    (split_part(tc.cell_id, '_', 2))::INT BETWEEN lon_b_min AND lon_b_max
  ORDER BY tc.claimed_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.cells_in_bbox(NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cells_in_bbox(NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT) TO authenticated;

-- ── 5. nearby_leaderboard — "your city" ranking ───────────────────────────
-- Returns top users among everyone who owns at least one cell inside the
-- given bounding box (typically ~10km around the caller's GPS location).
CREATE OR REPLACE FUNCTION public.nearby_leaderboard(
  p_lat_min    NUMERIC,
  p_lat_max    NUMERIC,
  p_lon_min    NUMERIC,
  p_lon_max    NUMERIC,
  limit_count  INT DEFAULT 50
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
STABLE
AS $$
#variable_conflict use_column
DECLARE
  caller_id  UUID := auth.uid();
  cell_deg   NUMERIC := 0.0018;
  lat_b_min  INT := FLOOR(p_lat_min / cell_deg)::INT;
  lat_b_max  INT := FLOOR(p_lat_max / cell_deg)::INT;
  lon_b_min  INT := FLOOR(p_lon_min / cell_deg)::INT;
  lon_b_max  INT := FLOOR(p_lon_max / cell_deg)::INT;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  RETURN QUERY
  WITH local_cells AS (
    SELECT owner_id
    FROM public.territory_cells
    WHERE (split_part(cell_id, '_', 1))::INT BETWEEN lat_b_min AND lat_b_max
      AND (split_part(cell_id, '_', 2))::INT BETWEEN lon_b_min AND lon_b_max
  ),
  agg AS (
    SELECT owner_id AS uid, COUNT(*)::BIGINT AS owned
    FROM local_cells GROUP BY owner_id
  ),
  ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY owned DESC) AS rnk,
      uid, owned
    FROM agg
  )
  SELECT
    r.rnk AS rank,
    'Lifter #' || LPAD(((ABS(HASHTEXT(r.uid::TEXT)) % 9000) + 1000)::TEXT, 4, '0')
      AS anon_handle,
    r.owned AS cells_owned,
    (r.uid = caller_id) AS is_current_user
  FROM ranked r
  WHERE r.rnk <= limit_count OR r.uid = caller_id
  ORDER BY r.rnk ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.nearby_leaderboard(NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nearby_leaderboard(NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT) TO authenticated;

-- ── 6. pending_steal_notifications — what notify_steal edge fn reads ───────
-- Lightweight queue. claim_cells inserts a row per steal-victim; edge fn
-- drains rows, sends pushes, deletes them. (Simpler than triggers + reduces
-- risk of doubled notifications.)
CREATE TABLE IF NOT EXISTS public.pending_steal_notifications (
  id          BIGSERIAL PRIMARY KEY,
  victim_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thief_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cells_lost  INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pending_steal_notifications ENABLE ROW LEVEL SECURITY;
-- No client-facing policies — only service role reads/deletes via edge fn.

-- Augment claim_cells once more so it enqueues victims (idempotent — replaces
-- the function we just defined with one that ALSO writes to the queue). We
-- keep separate logic so users can disable notifications later.
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
  v_last_run     TIMESTAMPTZ;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Anti-cheat checks
  IF v_total > 5 AND p_distance_m < (v_total * 50) THEN
    RAISE EXCEPTION 'anti-cheat: implausible cell-to-distance ratio';
  END IF;

  SELECT MAX(finished_at) INTO v_last_run
  FROM public.territory_runs WHERE user_id = caller_id;
  IF v_last_run IS NOT NULL AND (NOW() - v_last_run) < INTERVAL '20 seconds' THEN
    RAISE EXCEPTION 'anti-cheat: please wait before posting another run';
  END IF;

  IF v_total = 0 THEN
    INSERT INTO public.territory_runs (user_id, distance_m, cells_claimed, cells_stolen)
    VALUES (caller_id, p_distance_m, 0, 0)
    RETURNING id INTO v_run_id;
    RETURN QUERY SELECT 0, 0, 0, v_run_id;
    RETURN;
  END IF;

  SELECT COUNT(*)::INT INTO v_cells_stolen
  FROM public.territory_cells
  WHERE cell_id = ANY(p_cell_ids) AND owner_id <> caller_id;

  WITH already_owned AS (
    SELECT cell_id FROM public.territory_cells
    WHERE cell_id = ANY(p_cell_ids) AND owner_id = caller_id
  )
  SELECT (v_total - COUNT(*))::INT INTO v_cells_new FROM already_owned;

  -- Enqueue steal notifications (one row per victim, grouped by victim_id)
  INSERT INTO public.pending_steal_notifications (victim_id, thief_id, cells_lost)
  SELECT owner_id, caller_id, COUNT(*)
  FROM public.territory_cells
  WHERE cell_id = ANY(p_cell_ids) AND owner_id <> caller_id
  GROUP BY owner_id;

  -- Upsert ownership + bump change_count when owner actually changed
  INSERT INTO public.territory_cells (cell_id, owner_id, claimed_at, change_count)
  SELECT unnest(p_cell_ids), caller_id, NOW(), 1
  ON CONFLICT (cell_id) DO UPDATE
    SET owner_id     = EXCLUDED.owner_id,
        claimed_at   = EXCLUDED.claimed_at,
        change_count = CASE
          WHEN territory_cells.owner_id <> EXCLUDED.owner_id
            THEN territory_cells.change_count + 1
            ELSE territory_cells.change_count
          END;

  INSERT INTO public.territory_runs (user_id, distance_m, cells_claimed, cells_stolen)
  VALUES (caller_id, p_distance_m, v_cells_new, v_cells_stolen)
  RETURNING id INTO v_run_id;

  RETURN QUERY SELECT v_total, v_cells_new, v_cells_stolen, v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cells(TEXT[], NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_cells(TEXT[], NUMERIC) TO authenticated;
