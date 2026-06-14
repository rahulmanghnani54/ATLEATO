-- ─────────────────────────────────────────────────────────────────────────────
-- 016 — Referral reward fulfillment
--
-- Migration 015 lets us COUNT a user's referrals. This migration GRANTS the
-- reward: hit 3 referrals → 1 month of Pro, free, recorded server-side so it
-- survives reinstalls and can't be faked by clearing local storage.
--
-- Design:
--   - profiles gains referral_reward_granted_at + referral_pro_until.
--   - claim_referral_reward() (SECURITY DEFINER) derives the caller's referral
--     code FROM auth.uid() (can't be spoofed to claim someone else's), counts
--     their referrals, and if >= 3 and not already granted, sets
--     referral_pro_until = now() + 30 days. Idempotent — grants exactly once.
--   - The client reads pro_until and elevates the effective tier to >= pro
--     while it's in the future (subscriptionManager.ts).
--
-- KNOWN LIMITATION (acceptable for launch): a referral = a waitlist signup
-- carrying the code, so a determined user could self-grant by signing up 3
-- throwaway emails. Reward is only 1 month Pro; tighten later (require the
-- referred to become a paid Vanguard, dedupe by domain) if it's abused.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_reward_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referral_pro_until         TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_referral_reward()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_code        TEXT;
  v_count       INTEGER;
  v_granted_at  TIMESTAMPTZ;
  v_pro_until   TIMESTAMPTZ;
  v_target      CONSTANT INTEGER := 3;
  v_did_grant   BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('referral_count', 0, 'granted', false, 'pro_until', NULL);
  END IF;

  -- Same code derivation the app + landing page use:
  -- first 8 hex chars of the user id, dashes stripped, upper-cased.
  v_code := UPPER(LEFT(REPLACE(v_uid::TEXT, '-', ''), 8));

  -- Count referrals attributed to this code (mirrors referral_count, mig 015).
  SELECT COUNT(*) INTO v_count
  FROM public.waitlist
  WHERE UPPER(source) LIKE '%\_REF\_' || v_code ESCAPE '\';

  SELECT referral_reward_granted_at, referral_pro_until
    INTO v_granted_at, v_pro_until
  FROM public.profiles
  WHERE id = v_uid;

  -- Grant once, when the threshold is first reached.
  IF v_count >= v_target AND v_granted_at IS NULL THEN
    v_pro_until := now() + INTERVAL '30 days';
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
