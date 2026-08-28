-- ─────────────────────────────────────────────────────────────────────────────
-- 023 — Server-authoritative subscription entitlement
--
-- Until now the paid tier lived ONLY on the device: lib/subscriptionManager.ts
-- hydrates `currentTier` from AsyncStorage and lib/featureGates.ts compares
-- ranks against it. Nothing on the server ever wrote or checked it, so a
-- patched binary — or anyone able to write that storage key — could hand
-- itself Legend, and the AI edge functions (which cost real Anthropic money)
-- had no tier to check even if they wanted to.
--
-- This migration makes the DATABASE the source of truth:
--   - profiles gains subscription_* columns that ONLY the service role writes
--     (the RevenueCat / Lemon Squeezy webhooks, via apply_subscription_event).
--   - subscription_events is the webhook ledger: UNIQUE (provider, event_id)
--     makes a replayed delivery a no-op, and the raw payload stays for audit.
--   - get_my_entitlement() is the single read the app and the edge functions
--     both trust. It derives identity from auth.uid(), never from an argument.
--
-- Nothing here changes free-tier behaviour: every existing row backfills to
-- 'free', which is exactly what the client already assumes.
--
-- Shape copied from 016/022 (SECURITY DEFINER + SET search_path + auth.uid())
-- and 011 (UNIQUE provider order id for webhook idempotency).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Entitlement columns on profiles ───
-- 'free' default means every pre-existing profile keeps today's behaviour.
-- subscription_expires_at NULL = no expiry (comp / lifetime); a past value
-- means the tier is dead — get_my_entitlement() below never honours a stale one.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier       TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_provider   TEXT,
  ADD COLUMN IF NOT EXISTS subscription_product_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

-- Named CHECKs added out-of-line so re-running this file is a no-op
-- (ADD CONSTRAINT has no IF NOT EXISTS in the Postgres versions we target).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_subscription_tier_valid') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_tier_valid
      CHECK (subscription_tier IN ('free', 'pro', 'legend'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_subscription_provider_valid') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_provider_valid
      CHECK (subscription_provider IS NULL
             OR subscription_provider IN ('revenuecat', 'lemonsqueezy', 'comp'));
  END IF;
END;
$$;

-- ─── 2. Write block on the entitlement columns ───
--
-- HOW THE BLOCK IS ACHIEVED — read this before touching profiles RLS:
--
-- RLS alone CANNOT do this. The existing policy (002_rls.sql) is
--   CREATE POLICY "profiles_own" ON profiles
--     FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- and a Postgres policy is evaluated per ROW, never per COLUMN — it can decide
-- *whether* a user may update their row, not *which columns* they may set. The
-- app depends on that policy for full_name / goal / height_cm / weight_kg /
-- onboarding_complete, so it stays exactly as it is.
--
-- The block is therefore a BEFORE INSERT OR UPDATE trigger that silently
-- reverts every entitlement column whenever the writer is one of the PostgREST
-- client roles (`authenticated`, `anon`). Inside a SECURITY DEFINER function
-- (apply_subscription_event, claim_referral_reward, set_referrer) CURRENT_USER
-- is the function owner, and the service role connects as `service_role`, so
-- legitimate entitlement writes pass straight through.
--
-- ⚠️ THE GUARDED SET IS EVERY INPUT TO get_my_entitlement(), NOT JUST
-- subscription_*. `profiles_own` above is FOR ALL on the whole row, so blocking
-- only subscription_tier would leave the *other* half of §4's resolution wide
-- open: a single
--   PATCH /rest/v1/profiles?id=eq.<own uid>  {"referral_pro_until":"2099-01-01"}
-- would satisfy step 2 of get_my_entitlement() and return tier 'legend' — which
-- the edge functions in _shared/entitlement.ts then honour. Same for the
-- anti-double-grant ledger claim_referral_reward() keeps in
-- referral_rewards_granted / referral_reward_granted_at (zero it and every month
-- already granted is re-granted), and for referred_by, whose only legitimate
-- writer set_referrer() (018) enforces the self-referral and already-set checks
-- a direct PATCH would skip. Anything a client can write that an entitlement
-- read can see belongs in the revert lists below.
--
-- It REVERTS rather than RAISEs on purpose: clients routinely PATCH a whole
-- profile object they read a moment earlier, and an exception there would break
-- ordinary profile edits (and the free tier) for everyone.
-- ⚠️ SECURITY INVOKER (the default) is LOAD-BEARING here — do not add
-- SECURITY DEFINER. Inside a definer function CURRENT_USER is the function
-- OWNER, so the role test below would read 'postgres' for every writer and the
-- guard would never fire. As an invoker trigger, CURRENT_USER is the role the
-- statement is actually running as: 'authenticated' for a client PATCH, and the
-- owner when the statement comes from apply_subscription_event() — which is
-- exactly the distinction we need. The trigger needs no extra privilege: it
-- only rewrites NEW.
CREATE OR REPLACE FUNCTION public.guard_profile_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only the roles a client JWT can ever run as are restricted.
  IF CURRENT_USER NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A brand-new row starts with no entitlement of any kind. handle_new_user()
    -- (004) is SECURITY DEFINER and so is exempt; this only rewrites the
    -- self-signup/upsert path a client can drive.
    NEW.subscription_tier         := 'free';
    NEW.subscription_expires_at   := NULL;
    NEW.subscription_provider     := NULL;
    NEW.subscription_product_id   := NULL;
    NEW.subscription_updated_at   := NULL;
    NEW.referral_pro_until        := NULL;
    NEW.referral_reward_granted_at := NULL;
    NEW.referral_rewards_granted  := 0;      -- NOT NULL column, so 0 not NULL
    NEW.referred_by               := NULL;
    NEW.referred_at               := NULL;
  ELSE
    -- Restoring from OLD (rather than raising) is what keeps a PostgREST upsert
    -- safe: ON CONFLICT DO UPDATE fires this branch with OLD = the live row, so
    -- app/(tabs)/coach.tsx's whole-object upsert cannot wipe a paid tier.
    NEW.subscription_tier         := OLD.subscription_tier;
    NEW.subscription_expires_at   := OLD.subscription_expires_at;
    NEW.subscription_provider     := OLD.subscription_provider;
    NEW.subscription_product_id   := OLD.subscription_product_id;
    NEW.subscription_updated_at   := OLD.subscription_updated_at;
    NEW.referral_pro_until        := OLD.referral_pro_until;
    NEW.referral_reward_granted_at := OLD.referral_reward_granted_at;
    NEW.referral_rewards_granted  := OLD.referral_rewards_granted;
    NEW.referred_by               := OLD.referred_by;
    NEW.referred_at               := OLD.referred_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_entitlement ON public.profiles;
CREATE TRIGGER profiles_guard_entitlement
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_entitlement();

-- Reading is fine — the user's own row only, which "profiles_own" already
-- restricts to auth.uid() = id. No new SELECT policy is needed or wanted.

-- ─── 3. Webhook ledger (idempotency + audit) ───
-- Every verified provider event lands here BEFORE profiles is touched. The
-- UNIQUE (provider, event_id) is the idempotency key: a retried or replayed
-- delivery loses the insert race and applies nothing (mirrors the
-- ls_order_id UNIQUE in 011_vanguard_orders).
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id          BIGSERIAL   PRIMARY KEY,
  provider    TEXT        NOT NULL,           -- 'revenuecat' | 'lemonsqueezy' | 'comp'
  event_id    TEXT        NOT NULL,           -- provider's own event identifier
  event_type  TEXT        NOT NULL,           -- e.g. 'INITIAL_PURCHASE', 'EXPIRATION'
  app_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id  TEXT,
  payload     JSONB       NOT NULL DEFAULT '{}'::JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_events_provider_event_uniq UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS subscription_events_user_idx
  ON public.subscription_events (app_user_id, received_at DESC);

-- RLS on, ZERO policies: with RLS enabled and no policy, anon/authenticated
-- can neither read nor write a single row. service_role bypasses RLS, so the
-- webhook (and only the webhook) sees this table. Do not add a policy here —
-- the payload holds provider-side purchase data.
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- ─── 4. get_my_entitlement() — the one entitlement read the app may trust ───
--
-- RESOLUTION ORDER (highest wins; expiry always downgrades):
--   1. paid subscription — subscription_tier, but ONLY while
--      subscription_expires_at IS NULL (no expiry) or still in the future.
--      An elapsed expiry resolves to 'free'; a stale paid tier is never served.
--   2. referral overlay — referral_pro_until in the future grants 'legend'
--      (016/020/022: the referral reward is a Legend month).
--   3. the HIGHER of the two, with rank free < pro < legend.
--
-- Identity is auth.uid(); there is deliberately no user-id argument, so this
-- can only ever answer for the caller. Returns 'free' for an anonymous caller.
CREATE OR REPLACE FUNCTION public.get_my_entitlement()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tier      TEXT;
  v_expires   TIMESTAMPTZ;
  v_ref_until TIMESTAMPTZ;
  v_paid      TEXT := 'free';          -- step 1 result
  v_eff       TEXT := 'free';          -- step 3 result
  v_source    TEXT := 'none';
  v_out_exp   TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object(
      'tier', 'free', 'expires_at', NULL,
      'source', 'none', 'referral_pro_until', NULL
    );
  END IF;

  SELECT subscription_tier, subscription_expires_at, referral_pro_until
    INTO v_tier, v_expires, v_ref_until
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'tier', 'free', 'expires_at', NULL,
      'source', 'none', 'referral_pro_until', NULL
    );
  END IF;

  -- 1. Paid subscription, only while live.
  IF COALESCE(v_tier, 'free') <> 'free'
     AND (v_expires IS NULL OR v_expires > now()) THEN
    v_paid    := v_tier;
    v_eff     := v_tier;
    v_source  := 'subscription';
    v_out_exp := v_expires;
  END IF;

  -- 2/3. Referral overlay grants Legend; it can only ever raise the tier, and
  -- it is ignored the moment referral_pro_until falls into the past.
  IF v_ref_until IS NOT NULL AND v_ref_until > now() THEN
    IF v_eff <> 'legend' THEN
      v_eff     := 'legend';
      v_source  := 'referral';
      v_out_exp := v_ref_until;
    ELSE
      -- Both sources are live at Legend: access lasts until the later of them
      -- (a NULL paid expiry means "no expiry" and stays NULL).
      v_source  := 'subscription+referral';
      IF v_out_exp IS NOT NULL THEN
        v_out_exp := GREATEST(v_out_exp, v_ref_until);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'tier',               v_eff,
    'expires_at',         v_out_exp,
    'source',             v_source,
    'referral_pro_until', v_ref_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_entitlement() TO authenticated;

-- ─── 5. apply_subscription_event() — the ONLY entitlement writer ───
--
-- Called by a webhook edge function AFTER it has verified the provider's
-- signature fail-closed. p_app_user_id must come from the verified payload
-- (RevenueCat's app_user_id, which lib/subscriptionManager.identifyBillingUser
-- binds to the Supabase user id) — never from an untrusted request body.
--
-- WHY IT IS GRANTED TO NO CLIENT ROLE:
-- this function sets the paid tier, which is the whole point of the paywall.
-- It is SECURITY DEFINER (it must bypass the trigger in §2 and RLS), so if
-- `authenticated` could execute it, any signed-in user could hand themselves
-- Legend with a single supabase.rpc() call — a worse hole than the client-side
-- one this migration exists to close. Supabase grants EXECUTE on new public
-- functions to anon/authenticated by default, so the REVOKE below is required,
-- not decorative. Only service_role (the webhook's key) may call it.
CREATE OR REPLACE FUNCTION public.apply_subscription_event(
  p_provider    TEXT,
  p_event_id    TEXT,
  p_event_type  TEXT,
  p_app_user_id UUID,
  p_tier        TEXT,
  p_expires_at  TIMESTAMPTZ DEFAULT NULL,
  p_product_id  TEXT        DEFAULT NULL,
  p_payload     JSONB       DEFAULT '{}'::JSONB,
  p_event_at    TIMESTAMPTZ DEFAULT now()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted  BIGINT;
  v_prev_at   TIMESTAMPTZ;
  v_exists    BOOLEAN;
BEGIN
  IF p_provider IS NULL OR p_event_id IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'apply_subscription_event: provider, event_id and event_type are required';
  END IF;

  IF p_tier IS NULL OR p_tier NOT IN ('free', 'pro', 'legend') THEN
    RAISE EXCEPTION 'apply_subscription_event: invalid tier %', p_tier;
  END IF;

  -- Idempotency gate. A replayed delivery loses this insert and returns here,
  -- so the profile write below runs at most once per (provider, event_id).
  INSERT INTO public.subscription_events
    (provider, event_id, event_type, app_user_id, product_id, payload)
  VALUES
    (p_provider, p_event_id, p_event_type, p_app_user_id, p_product_id,
     COALESCE(p_payload, '{}'::JSONB))
  ON CONFLICT ON CONSTRAINT subscription_events_provider_event_uniq DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN json_build_object('applied', false, 'reason', 'duplicate_event');
  END IF;

  -- Event recorded for audit even when we cannot attribute it to an account
  -- (unknown app_user_id = a purchase made before sign-in, or a test event).
  IF p_app_user_id IS NULL THEN
    RETURN json_build_object('applied', false, 'reason', 'no_app_user_id');
  END IF;

  SELECT TRUE, subscription_updated_at
    INTO v_exists, v_prev_at
  FROM public.profiles
  WHERE id = p_app_user_id;

  IF NOT COALESCE(v_exists, FALSE) THEN
    RETURN json_build_object('applied', false, 'reason', 'unknown_profile');
  END IF;

  -- Providers can deliver out of order (a retried INITIAL_PURCHASE arriving
  -- after the EXPIRATION that followed it). Never let an older event overwrite
  -- a newer decision.
  IF v_prev_at IS NOT NULL AND p_event_at IS NOT NULL AND p_event_at < v_prev_at THEN
    RETURN json_build_object('applied', false, 'reason', 'stale_event');
  END IF;

  -- Downgrades are as important as upgrades: an EXPIRATION/CANCELLATION event
  -- passes p_tier => 'free' and must take effect immediately.
  UPDATE public.profiles
     SET subscription_tier       = p_tier,
         subscription_expires_at = p_expires_at,
         subscription_provider   = p_provider,
         subscription_product_id = p_product_id,
         subscription_updated_at = COALESCE(p_event_at, now())
   WHERE id = p_app_user_id;

  RETURN json_build_object(
    'applied',    true,
    'user_id',    p_app_user_id,
    'tier',       p_tier,
    'expires_at', p_expires_at
  );
END;
$$;

-- Strip the default grants Supabase hands to the client roles, then hand
-- EXECUTE to the webhook's role only (same shape as
-- assign_next_vanguard_pass_no() in 011).
REVOKE ALL ON FUNCTION public.apply_subscription_event(
  TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_subscription_event(
  TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, TIMESTAMPTZ
) TO service_role;
