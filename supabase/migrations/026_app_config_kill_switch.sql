-- ─────────────────────────────────────────────────────────────────────────────
-- 026 — Remote kill switch for the endpoints that spend money
--
-- THE GAP: there is no way to turn anything off without shipping a build.
-- expo-updates looks available (it is in package.json and eas.json defines
-- channels) but the manifest packaged into the release sets
-- expo.modules.updates.ENABLED=false and app.json declares no updates.url or
-- runtimeVersion, so the native module has nothing to check. featureGates.ts is
-- a compiled-in constant table. PostHog is initialised but the wrapper never
-- exposes its feature-flag API. So if a feature starts costing money or
-- misbehaving, the only remedy is a store release and a review wait.
--
-- WHY SERVER-SIDE. A client-side flag hides a broken feature from honest users,
-- which is worth having — but it stops no abuse at all, because an attacker
-- calls the endpoint directly and never runs our UI. To be a COST control the
-- switch has to live where the money is spent.
--
-- WHY IN THE QUOTA RPC. consume_ai_quota() is already called immediately before
-- every paid provider fetch, so folding the check in costs zero extra round
-- trips and cannot be forgotten at a call site: an endpoint that is metered is
-- automatically killable, and one that is not metered spends nothing.
--
-- OPERATIONALLY: to stop all Anthropic spend right now, from the SQL editor —
--     UPDATE public.app_config SET enabled = FALSE WHERE key <> 'voice_call_token';
-- Effective on the next request. No deploy, no review, no app update.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_config (
  key        TEXT PRIMARY KEY,
  enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Config, not secrets: any client may read it (so the UI can grey out a feature
-- that has been turned off, rather than letting the user tap into an error).
-- Only the service role may write.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_public_read ON public.app_config;
CREATE POLICY app_config_public_read ON public.app_config
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.app_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_config TO anon, authenticated;

-- Seed one row per metered action. Keys match _shared/quota.ts DAILY_QUOTA, so
-- the switch and the meter always talk about the same thing.
INSERT INTO public.app_config (key, note) VALUES
  ('ai_coach_chat',      'AI coach chat (free tier headline feature)'),
  ('analyze_workout',    'Post-workout AI analysis'),
  ('nutrition_advice',   'Nutrition advice'),
  ('generate_meal_plan', 'Meal plan generation — priciest text endpoint'),
  ('recovery_plan',      'Recovery plan'),
  ('weekly_summary',     'Weekly summary'),
  ('form_feedback',      'AI form coach (pro)'),
  ('food_scan',          'Food photo scanner (pro)'),
  ('physique_analysis',  'Physique photo scoring — Sonnet vision, most expensive call'),
  ('voice_call_token',   'ElevenLabs conversation tokens — billed per minute downstream')
ON CONFLICT (key) DO NOTHING;

-- ─── consume_ai_quota, now kill-switch aware ───
-- Body is otherwise unchanged from 024; see that file for the atomicity notes.
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
  IF v_user IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'no_identity', 'used', 0, 'limit', COALESCE(p_limit, 0));
  END IF;

  IF p_action IS NULL OR p_action = '' OR p_limit IS NULL OR p_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'not_permitted', 'used', 0, 'limit', COALESCE(p_limit, 0));
  END IF;

  -- Kill switch. Checked BEFORE the counter is touched, so turning a feature
  -- off does not silently consume anyone's allowance. A missing row means
  -- enabled: a new action ships working, and the switch is opt-in.
  IF EXISTS (SELECT 1 FROM public.app_config c WHERE c.key = p_action AND c.enabled = FALSE) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'feature_disabled', 'used', 0, 'limit', p_limit);
  END IF;

  INSERT INTO public.ai_usage AS u (user_id, action, day, used)
  VALUES (v_user, p_action, v_day, 1)
  ON CONFLICT (user_id, action, day)
  DO UPDATE SET used = u.used + 1
    WHERE u.used < p_limit
  RETURNING u.used INTO v_used;

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

REVOKE ALL ON FUNCTION public.consume_ai_quota(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(TEXT, INTEGER) TO authenticated, service_role;
