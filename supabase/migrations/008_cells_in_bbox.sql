-- ─────────────────────────────────────────────────────────────────────────────
-- cells_in_bbox — returns all currently-owned cells whose SW corner falls
-- inside the requested bounding box. Powers the live territory map.
--
-- Cell IDs are encoded as `${lat_bucket}_${lon_bucket}` where each bucket
-- is the floor of (coord / 0.0018°). To answer a bbox query we decode the
-- two ints out of the id with regexp_split_to_array.
--
-- Performance note: with up to ~1k cells in a typical city viewport this
-- is fine. If usage scales past a few million claimed cells we should add a
-- generated (lat_b, lon_b) column + composite index, but premature.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop any prior version first — Postgres won't allow CREATE OR REPLACE to
-- change the OUT-parameter row type (RETURNS TABLE columns), so re-running
-- this migration against a DB that has an older signature fails with 42P13.
-- Safe no-op if the function doesn't exist yet.
DROP FUNCTION IF EXISTS public.cells_in_bbox(NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT);
DROP FUNCTION IF EXISTS public.cells_in_bbox(NUMERIC, NUMERIC, NUMERIC, NUMERIC);

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
  claimed_at       TIMESTAMPTZ
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
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    tc.cell_id,
    (tc.owner_id = caller_id) AS is_current_user,
    'Lifter #' || LPAD(((ABS(HASHTEXT(tc.owner_id::TEXT)) % 9000) + 1000)::TEXT, 4, '0')
      AS anon_handle,
    tc.claimed_at
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
