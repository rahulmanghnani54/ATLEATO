-- ─────────────────────────────────────────────────────────────────────────────
-- 020 — Referral reward = Vanguard pass (Legend), earned at 3 referrals
--
-- Founder decision: the Vanguard founding pass unlocks the LEGEND tier, earned
-- EITHER by paying $1.99 OR by referring 3 friends. So the in-app referral
-- reward changes from "10 referred installs → Pro" (mig 018) to
-- "3 referred installs → Legend".
--
-- DB-side: only the threshold changes (3). The reward is still recorded as
-- referral_pro_until = now()+30d; the CLIENT (subscriptionManager) decides the
-- tier that timestamp unlocks — now Legend, not Pro.
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
  v_target     CONSTANT INTEGER := 3;   -- 3 referrals → Vanguard pass (Legend)
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
    v_pro_until := now() + INTERVAL '30 days';   -- 1 month free Legend (Vanguard)
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
