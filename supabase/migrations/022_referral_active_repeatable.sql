-- ─────────────────────────────────────────────────────────────────────────────
-- 022 — Referral anti-fraud: ACTIVE referrals + REPEATABLE rewards (SOT §5)
--
-- The post-launch in-app referral promise ("refer 10 → 1 month Legend,
-- repeatable") is gameable if "referral" = a raw install. This enforces the
-- SOT definition server-side:
--   ACTIVE = referred user opened the app on 3+ DISTINCT days within their
--            first 7 days. Fake installs that never open don't count.
--   REPEATABLE = every 10 active referrals grants another month (tracked by
--            referral_rewards_granted, so re-claims top up, never double-grant).
--   ANTI-FRAUD = self-referral already blocked (mig 018 set_referrer); the
--            "active" bar is the main lever; device/IP fingerprinting is a
--            further hardening step (needs client device id — TODO).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── App-open day tracking (one row per user per day) ──
CREATE TABLE IF NOT EXISTS public.user_app_opens (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     DATE NOT NULL DEFAULT current_date,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.user_app_opens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_app_opens_own ON public.user_app_opens;
CREATE POLICY user_app_opens_own ON public.user_app_opens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Record today's app-open for the caller (idempotent). Called on app launch.
CREATE OR REPLACE FUNCTION public.record_app_open()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.user_app_opens(user_id, day)
  VALUES (auth.uid(), current_date)
  ON CONFLICT DO NOTHING;
$$;
GRANT EXECUTE ON FUNCTION public.record_app_open() TO authenticated;

-- Track how many reward-months have been granted (for repeatable top-ups).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_rewards_granted INTEGER NOT NULL DEFAULT 0;

-- Count the caller's ACTIVE referrals (≥3 distinct open-days in first 7).
CREATE OR REPLACE FUNCTION public.active_referral_count()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND UPPER(p.referred_by) = UPPER(LEFT(REPLACE(auth.uid()::TEXT, '-', ''), 8))
    AND (
      SELECT COUNT(DISTINCT o.day)
      FROM public.user_app_opens o
      WHERE o.user_id = p.id
        AND o.day <= (p.created_at::DATE + 7)
    ) >= 3;
$$;
GRANT EXECUTE ON FUNCTION public.active_referral_count() TO authenticated;

-- Repeatable reward: every 10 ACTIVE referrals → 1 month Legend. Re-claimable;
-- tops up only the newly-earned months, extending from the later of now/expiry.
CREATE OR REPLACE FUNCTION public.claim_referral_reward()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_self      TEXT;
  v_active    INTEGER;
  v_earned    INTEGER;   -- total months earned = floor(active / 10)
  v_granted   INTEGER;   -- months already granted
  v_pro_until TIMESTAMPTZ;
  v_new       INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('active_referrals', 0, 'target', 10, 'granted', false, 'pro_until', NULL);
  END IF;

  v_self := UPPER(LEFT(REPLACE(v_uid::TEXT, '-', ''), 8));

  SELECT COUNT(*) INTO v_active
  FROM public.profiles p
  WHERE UPPER(p.referred_by) = v_self
    AND (
      SELECT COUNT(DISTINCT o.day) FROM public.user_app_opens o
      WHERE o.user_id = p.id AND o.day <= (p.created_at::DATE + 7)
    ) >= 3;

  v_earned := v_active / 10;  -- integer division

  SELECT referral_rewards_granted, referral_pro_until
    INTO v_granted, v_pro_until
  FROM public.profiles WHERE id = v_uid;

  IF v_earned > COALESCE(v_granted, 0) THEN
    v_new := v_earned - COALESCE(v_granted, 0);
    v_pro_until := GREATEST(COALESCE(v_pro_until, now()), now()) + (v_new * INTERVAL '30 days');
    UPDATE public.profiles
       SET referral_rewards_granted   = v_earned,
           referral_pro_until         = v_pro_until,
           referral_reward_granted_at = COALESCE(referral_reward_granted_at, now())
     WHERE id = v_uid;
  END IF;

  RETURN json_build_object(
    'active_referrals', v_active,
    'target',           10,
    'months_earned',    v_earned,
    'newly_granted',    v_new,
    'granted',          v_new > 0,
    'pro_until',        v_pro_until
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward() TO authenticated;
