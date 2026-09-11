-- ─────────────────────────────────────────────────────────────────────────────
-- 029 — grant_comp(): comp an account without writing a migration
--
-- WHY: 027 and 028 each hardcoded an email address into a one-shot migration.
-- That broke the moment the demo address changed: 028 is already applied (it
-- granted evulto.app+demo), applied migrations never re-run, and the account it
-- was meant to comp did not exist yet when it ran. Comping an account is an
-- operational action, not a schema change, and it should be one SQL call.
--
-- USAGE (Supabase dashboard → SQL editor, as the service role):
--     SELECT public.grant_comp('atleato.app+demo@gmail.com');
--     SELECT public.grant_comp('someone@example.com', 'pro');
--     SELECT public.revoke_comp('evulto.app+demo@gmail.com');
--
-- The account must already EXIST (sign it up first — "Confirm email" is on, so
-- the address has to receive mail). The function reports what it did rather
-- than failing silently.
--
-- SAFETY: service_role only. REVOKEd from anon and authenticated, so no client
-- can call it. It never overwrites a real paid subscription — if the account
-- has bought something, the webhook's row wins and the call returns 'skipped'.
-- Writes go through the same profiles.subscription_* columns as 023, so the app
-- and the edge functions agree because they read the same row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_comp(
  p_email TEXT,
  p_tier  TEXT DEFAULT 'legend',
  p_label TEXT DEFAULT 'comp'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_current TEXT;
BEGIN
  IF p_tier NOT IN ('pro', 'legend') THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'tier must be pro or legend');
  END IF;

  SELECT u.id INTO v_user_id
    FROM auth.users u
   WHERE LOWER(u.email) = LOWER(p_email)
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_found', 'email', p_email,
      'hint',   'sign the account up in the app and confirm the email first');
  END IF;

  SELECT p.subscription_provider INTO v_current
    FROM public.profiles p WHERE p.id = v_user_id;

  -- A real purchase is the truth. Never paper over it with a comp.
  IF v_current IS NOT NULL AND v_current NOT IN ('comp', 'none', '') THEN
    RETURN jsonb_build_object(
      'status', 'skipped', 'email', p_email,
      'reason', 'account holds a paid subscription via ' || v_current);
  END IF;

  UPDATE public.profiles
     SET subscription_tier       = p_tier,
         subscription_expires_at = NULL,          -- NULL = no expiry (023's comp semantics)
         subscription_provider   = 'comp',
         subscription_product_id = p_label,
         subscription_updated_at = NOW()
   WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error', 'email', p_email,
      'reason', 'auth user exists but has no profiles row');
  END IF;

  RETURN jsonb_build_object('status', 'granted', 'email', p_email, 'tier', p_tier);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_comp(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT u.id INTO v_user_id
    FROM auth.users u WHERE LOWER(u.email) = LOWER(p_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'email', p_email);
  END IF;

  -- Only undo a COMP. A paid row is left exactly as the webhook wrote it.
  UPDATE public.profiles
     SET subscription_tier       = 'free',
         subscription_expires_at = NULL,
         subscription_provider   = NULL,
         subscription_product_id = NULL,
         subscription_updated_at = NOW()
   WHERE id = v_user_id
     AND subscription_provider = 'comp';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'skipped', 'email', p_email, 'reason', 'not a comp account');
  END IF;

  RETURN jsonb_build_object('status', 'revoked', 'email', p_email);
END;
$$;

-- Operators only. A client that could call these would be handing itself Legend.
REVOKE ALL ON FUNCTION public.grant_comp(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_comp(TEXT)            FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_comp(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_comp(TEXT)            TO service_role;

-- ─── Apply to the current demo choice ───
-- No-ops with a clear status if the account has not been signed up yet; run
-- the SELECT above by hand once it has.
DO $$
DECLARE r JSONB;
BEGIN
  r := public.grant_comp('atleato.app+demo@gmail.com', 'legend', 'demo_review');
  RAISE NOTICE 'demo (atleato.app+demo): %', r::TEXT;
END
$$;
