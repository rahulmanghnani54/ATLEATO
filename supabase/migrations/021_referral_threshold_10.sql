-- ─────────────────────────────────────────────────────────────────────────────
-- 021 — In-app referral reward: 10 (post-launch), grants Legend
--
-- Per the pricing/referral single-source-of-truth, there are TWO mechanics:
--   • Vanguard Pass (PRE-LAUNCH): $1.99 OR refer 3 signups → Legend at launch.
--     Tracked via the waitlist referral_count (mig 015); fulfilled at launch.
--   • In-app referral (POST-LAUNCH, this RPC): refer 10 ACTIVE users → 1 month
--     Legend, repeatable.
--
-- mig 020 mistakenly set this in-app threshold to 3. Restore it to 10.
--
-- PRE-SHIP GUARDRAILS (SOT §5 — required before the post-launch program goes
-- live, NOT yet implemented here):
--   • "active" = downloaded + signed up + opened the app on 3+ distinct days in
--     the first 7. This RPC currently counts referred INSTALLS (profiles
--     .referred_by), not activity — tighten before launching the program.
--   • repeatable grants (currently one-time via referral_reward_granted_at).
--   • self-referral / duplicate / fraud blocking.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_referral_reward()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_self       TEXT;
  v_count      INTEGER;
  v_granted_at TIMESTAMPTZ;
  v_pro_until  TIMESTAMPTZ;
  v_target     CONSTANT INTEGER := 10;  -- post-launch in-app: 10 active referrals
  v_did_grant  BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('referral_count', 0, 'target', v_target, 'granted', false, 'pro_until', NULL);
  END IF;

  v_self := UPPER(LEFT(REPLACE(v_uid::TEXT, '-', ''), 8));

  SELECT COUNT(*) INTO v_count
  FROM public.profiles
  WHERE UPPER(referred_by) = v_self;

  SELECT referral_reward_granted_at, referral_pro_until
    INTO v_granted_at, v_pro_until
  FROM public.profiles WHERE id = v_uid;

  IF v_count >= v_target AND v_granted_at IS NULL THEN
    v_pro_until := now() + INTERVAL '30 days';   -- 1 month free Legend
    UPDATE public.profiles
       SET referral_reward_granted_at = now(),
           referral_pro_until         = v_pro_until
     WHERE id = v_uid;
    v_did_grant := TRUE;
  END IF;

  RETURN json_build_object(
    'referral_count',  v_count,
    'target',          v_target,
    'granted',         v_did_grant,
    'already_granted', (v_granted_at IS NOT NULL),
    'pro_until',       v_pro_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_referral_reward() TO authenticated;
