-- ─────────────────────────────────────────────────────────────────────────────
-- 024 — Durable per-user AI usage quota
--
-- WHY: until now the ONLY throttle on the ten edge functions that spend real
-- Anthropic / ElevenLabs money was checkRateLimit() in _shared/security.ts —
-- a module-level Map inside a single Deno isolate. Its own header concedes it
-- "works within a single Deno isolate", and Supabase runs many: fire requests
-- concurrently and each lands on a fresh Map, wait out the idle-recycle window
-- and the Map is gone, redeploy and everything resets. So the declared ceilings
-- were a floor, not a guarantee, and nothing bounded spend over a day.
--
-- ai_coach_chat/index.ts:19-21 already said what was needed: "a durable
-- per-user daily cap belongs in the DB ... and is not added here". This is it.
--
-- SHAPE: one row per (user, action, UTC day), incremented and checked in a
-- single atomic statement so two concurrent isolates cannot both pass the
-- check. Identity comes from auth.uid() inside the database — never from an
-- argument — the same rule get_my_entitlement() follows in 023, so a caller
-- can neither spend someone else's quota nor claim to be them.
--
-- WHAT THIS IS NOT: a tier gate. Quota bounds cost for EVERY caller including
-- paying ones; requireTier() decides who may call at all. The two are
-- deliberately separate — most of these endpoints are free features, and a
-- quota is how a free feature stays free without being unlimited.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action  TEXT    NOT NULL,
  day     DATE    NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, day)
);

-- Rows are worthless after their day has passed; this index is what makes the
-- periodic prune at the bottom cheap.
CREATE INDEX IF NOT EXISTS ai_usage_day_idx ON public.ai_usage (day);

-- RLS on with NO policies at all: clients get nothing, not even their own rows.
-- The counter is not the client's business, and a readable counter is a
-- reconnaissance aid ("how much budget is left before I get blocked?").
-- consume_ai_quota() below is SECURITY DEFINER and bypasses this by design.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_usage FROM PUBLIC, anon, authenticated;

-- ─── consume_ai_quota ───
-- Atomically: increment this user's counter for (action, today) and report
-- whether they were inside the limit. Returns JSONB rather than a bare boolean
-- so the caller can tell the user how much they have left and when it resets.
--
-- ATOMICITY is the whole point. The check lives in the ON CONFLICT ... WHERE
-- clause, so Postgres evaluates it while holding the row lock: two isolates
-- racing on the last unit produce exactly one winner. A read-then-write in
-- TypeScript would let both through, which is precisely the bug that made the
-- in-memory limiter useless.
--
-- p_limit is supplied by the CALLER (the edge function) rather than stored
-- here, so a limit change ships with `supabase functions deploy` and never
-- needs an app-store release. That is safe even though `authenticated` may
-- execute this directly: auth.uid() pins the row to the caller, so passing an
-- absurd p_limit only inflates their OWN counter. It cannot raise the ceiling
-- any edge function enforces, because each call re-checks against the real
-- limit the function passes.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_action TEXT, p_limit INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID    := auth.uid();
  v_day  DATE    := (now() AT TIME ZONE 'utc')::DATE;
  v_used INTEGER;
BEGIN
  -- No JWT (or a service-role client, which has no auth.uid()) → deny. Failing
  -- closed here means a misconfigured caller cannot spend money anonymously.
  IF v_user IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'no_identity', 'used', 0, 'limit', COALESCE(p_limit, 0));
  END IF;

  IF p_action IS NULL OR p_action = '' OR p_limit IS NULL OR p_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'not_permitted', 'used', 0, 'limit', COALESCE(p_limit, 0));
  END IF;

  -- Kill switch (migration 026 adds public.app_config). Guarded by to_regclass
  -- so this file still works standalone BEFORE 026 exists — and, more important,
  -- so REPLAYING this migration after 026 cannot silently disarm the switch by
  -- restoring a body that never checks it. A missing table or missing row means
  -- enabled, so a new action ships working.
  IF to_regclass('public.app_config') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.app_config c WHERE c.key = p_action AND c.enabled = FALSE) THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'feature_disabled', 'used', 0, 'limit', p_limit);
    END IF;
  END IF;

  INSERT INTO public.ai_usage AS u (user_id, action, day, used)
  VALUES (v_user, p_action, v_day, 1)
  ON CONFLICT (user_id, action, day)
  DO UPDATE SET used = u.used + 1
    WHERE u.used < p_limit
  RETURNING u.used INTO v_used;

  -- No row returned = the WHERE blocked the update = already at the ceiling.
  -- Nothing was incremented, so a blocked caller cannot inflate their own count
  -- by hammering the endpoint.
  IF v_used IS NULL THEN
    SELECT u.used INTO v_used
      FROM public.ai_usage u
     WHERE u.user_id = v_user AND u.action = p_action AND u.day = v_day;

    RETURN jsonb_build_object(
      'allowed',   false,
      'reason',    'quota_exceeded',
      'used',      COALESCE(v_used, p_limit),
      'limit',     p_limit,
      'remaining', 0,
      'resets_at', ((v_day + 1)::TIMESTAMP AT TIME ZONE 'utc')
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',   true,
    'used',      v_used,
    'limit',     p_limit,
    'remaining', GREATEST(p_limit - v_used, 0),
    'resets_at', ((v_day + 1)::TIMESTAMP AT TIME ZONE 'utc')
  );
END;
$$;

-- anon must never reach this: an unauthenticated caller has no auth.uid(), and
-- letting it execute would only create noise. authenticated needs it because
-- the edge functions call it with the USER-scoped client (anon key + caller's
-- Authorization header) — the same shape get_my_entitlement() uses in 023.
REVOKE ALL ON FUNCTION public.consume_ai_quota(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(TEXT, INTEGER) TO authenticated, service_role;

-- ─── Housekeeping ───
-- Yesterday's counters are dead weight. Kept as a plain function rather than a
-- cron job so it can be scheduled from wherever the project already schedules
-- things, or simply ignored — the table stays small either way.
CREATE OR REPLACE FUNCTION public.prune_ai_usage(p_keep_days INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.ai_usage
   WHERE day < ((now() AT TIME ZONE 'utc')::DATE - GREATEST(p_keep_days, 1));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_ai_usage(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_ai_usage(INTEGER) TO service_role;

-- Schedule the prune if pg_cron is available (it is on Supabase, once enabled).
-- Guarded and swallowed: a project without the extension, or without rights to
-- schedule, must still apply this migration cleanly — the table is small and a
-- missing prune is untidy, not broken. Without this the function was dead code:
-- one row per user per action per day accumulates forever.
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('prune-ai-usage');
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- no such job yet
    END;
    BEGIN
      PERFORM cron.schedule('prune-ai-usage', '17 3 * * *', 'SELECT public.prune_ai_usage(7);');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'ai_usage prune not scheduled (pg_cron present but schedule failed)';
    END;
  ELSE
    RAISE NOTICE 'pg_cron not installed — run SELECT public.prune_ai_usage(7); periodically, or ignore';
  END IF;
END
$outer$;
