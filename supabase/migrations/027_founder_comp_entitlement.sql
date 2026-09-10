-- ─────────────────────────────────────────────────────────────────────────────
-- 027 — Make the founder comp real, on the server
--
-- THE BUG: lib/subscriptionManager.ts keeps a FOUNDER_EMAILS set whose members
-- always resolve to 'legend' from effectiveTier(). That is a CLIENT-ONLY
-- unlock. Since 023 the server is the source of truth: requireTier() in the
-- edge functions asks get_my_entitlement(), which reads profiles.subscription_*
-- and knows nothing about that list.
--
-- So a comp account gets the paid UI and then fails every paid call. Open the
-- Form Coach, point the camera, and analyze/form-feedback answers 403
-- upgrade_required. The owner's own account is the one most likely to hit it,
-- and the failure looks like a broken feature rather than a missing grant.
--
-- THE FIX: grant the comp through the normal entitlement columns, so client and
-- server agree because they are reading the same thing. NULL expiry is what 023
-- already defines as "no expiry (comp / lifetime)", and provider='comp'
-- distinguishes it from a real purchase in the ledger.
--
-- Once this is applied, the client-side FOUNDER_EMAILS backdoor is redundant and
-- is removed in the same change — one source of truth, which was the whole point
-- of 023.
--
-- IDEMPOTENT and NON-DESTRUCTIVE: it only touches rows whose email matches, and
-- it will not overwrite a real paid subscription if one of these accounts ever
-- buys one (the WHERE guards on provider).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  -- Keep this list in step with the one that used to live in
  -- lib/subscriptionManager.ts. Lowercase.
  v_emails TEXT[] := ARRAY[
    '9alley27@gmail.com',
    'madasales15@gmail.com'
  ];
  v_updated INTEGER;
BEGIN
  UPDATE public.profiles p
     SET subscription_tier       = 'legend',
         subscription_expires_at = NULL,          -- NULL = no expiry (comp)
         subscription_provider   = 'comp',
         subscription_product_id = 'founder_comp',
         subscription_updated_at = NOW()
    FROM auth.users u
   WHERE u.id = p.id
     AND LOWER(u.email) = ANY (v_emails)
     -- Never clobber a genuine purchase. If a founder account has actually paid,
     -- the webhook's row is the truthful one and must win.
     AND (p.subscription_provider IS NULL
          OR p.subscription_provider IN ('comp', 'none', ''));

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Not an error: the accounts may not exist yet in this environment, or may
    -- already hold a real subscription. Say so rather than failing the deploy.
    RAISE NOTICE 'founder comp: no profiles updated (accounts absent, or already on a paid provider)';
  ELSE
    RAISE NOTICE 'founder comp: % profile(s) granted legend', v_updated;
  END IF;
END
$$;
