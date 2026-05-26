-- ─────────────────────────────────────────────────────────────────────────────
-- Global Weekly Leaderboard
--
-- Anonymous leaderboard ranked by total workout volume for the current week
-- (Monday → Sunday). Bypasses per-row RLS via SECURITY DEFINER so any
-- authenticated user can read the aggregate top-N + their own rank without
-- being able to query other users' raw rows.
--
-- Privacy:
--   - We expose only a deterministic anonymous handle: 'Lifter #' + 4-digit
--     pseudo-id derived from the user_id (so people stay anonymous but their
--     rank persists week-over-week).
--   - No names, no emails, no profile photos are ever returned.
--
-- Implementation note:
--   Inner CTE columns use distinct names (uid/v_kg/sess/rnk) to avoid the
--   PL/pgSQL OUT-parameter ambiguity (`volume_kg` is both a column alias and
--   an OUT variable). The final SELECT renames them back to the contract.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.global_weekly_leaderboard(
  limit_count INT DEFAULT 100
)
RETURNS TABLE (
  rank             BIGINT,
  anon_handle      TEXT,
  volume_kg        NUMERIC,
  sessions         BIGINT,
  is_current_user  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  week_start DATE;
  caller_id UUID := auth.uid();
BEGIN
  -- Monday of the current week
  week_start := (current_date - ((EXTRACT(DOW FROM current_date)::INT + 6) % 7));

  RETURN QUERY
  WITH agg AS (
    SELECT
      wl.user_id                                    AS uid,
      COALESCE(SUM(wl.total_volume_kg), 0)::NUMERIC AS v_kg,
      COUNT(DISTINCT wl.date)::BIGINT               AS sess
    FROM public.workout_logs wl
    WHERE wl.date >= week_start
      AND wl.total_volume_kg IS NOT NULL
      AND wl.total_volume_kg > 0
    GROUP BY wl.user_id
  ),
  ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY v_kg DESC) AS rnk,
      uid, v_kg, sess
    FROM agg
  )
  SELECT
    r.rnk                                                                              AS rank,
    'Lifter #' || LPAD(((ABS(HASHTEXT(r.uid::TEXT)) % 9000) + 1000)::TEXT, 4, '0')     AS anon_handle,
    ROUND(r.v_kg, 1)                                                                   AS volume_kg,
    r.sess                                                                             AS sessions,
    (r.uid = caller_id)                                                                AS is_current_user
  FROM ranked r
  WHERE r.rnk <= limit_count
     OR r.uid = caller_id
  ORDER BY r.rnk ASC;
END;
$$;

-- Allow any authenticated user to call it
REVOKE ALL ON FUNCTION public.global_weekly_leaderboard(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_weekly_leaderboard(INT) TO authenticated;
