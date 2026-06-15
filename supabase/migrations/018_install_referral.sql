-- ─────────────────────────────────────────────────────────────────────────────
-- 018 — Install-based referral reward (replaces waitlist-based threshold)
--
-- Per founder decision: the referral reward should count REAL APP INSTALLS
-- (people who installed + signed up via your link), not waitlist emails — and
-- the threshold is 10, not 3. Waitlist-based attribution (mig 015) stays for
-- the pre-launch 500 window; THIS is the durable in-app reward.
--
-- Attribution comes from a deep-link SDK (Branch): a newly-installed user's
-- first session carries the referrer's code, the app calls set_referrer(code),
-- and it's stored on profiles.referred_by. The referrer's count = profiles
-- referred by their code. 10 → 1 month Pro.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by  TEXT,
  ADD COLUMN IF NOT EXISTS referred_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles (UPPER(referred_by));

-- ── set_referrer: a new user records who referred them, exactly once ──
-- Rejects: unauthenticated, malformed code, self-referral, already-set.
CREATE OR REPLACE FUNCTION public.set_referrer(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_self     TEXT;
  v_existing TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF p_code IS NULL OR length(trim(p_code)) < 4 THEN RETURN json_build_object('ok', false, 'reason', 'bad_code'); END IF;

  v_self := UPPER(LEFT(REPLACE(v_uid::TEXT, '-', ''), 8));
  IF UPPER(trim(p_code)) = v_self THEN RETURN json_build_object('ok', false, 'reason', 'self_referral'); END IF;

  SELECT referred_by INTO v_existing FROM public.profiles WHERE id = v_uid;
  IF v_existing IS NOT NULL THEN RETURN json_build_object('ok', false, 'reason', 'already_set'); END IF;

  UPDATE public.profiles
     SET referred_by = UPPER(trim(p_code)), referred_at = now()
   WHERE id = v_uid;

  RETURN json_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_referrer(TEXT) TO authenticated;

-- ── install_referral_count: how many real installs the caller referred ──
CREATE OR REPLACE FUNCTION public.install_referral_count()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.profiles
  WHERE auth.uid() IS NOT NULL
    AND UPPER(referred_by) = UPPER(LEFT(REPLACE(auth.uid()::TEXT, '-', ''), 8));
$$;
GRANT EXECUTE ON FUNCTION public.install_referral_count() TO authenticated;

-- ── claim_referral_reward: 10 referred installs → 1 free month of Pro ──
-- Replaces mig 016's waitlist-based version. Same reward columns; idempotent.
CREATE OR REPLACE FUNCTION public.claim_referral_reward()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_self       TEXT;
  v_count      INTEGER;
  v_granted_at TIMESTAMPTZ;
  v_pro_until  TIMESTAMPTZ;
  v_target     CONSTANT INTEGER := 10;
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
