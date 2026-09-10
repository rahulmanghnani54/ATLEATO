-- ─────────────────────────────────────────────────────────────────────────────
-- 028 — Full-access demo account for Play/App Store review and manual testing
--
-- WHY: Google Play's App content → App access section requires working demo
-- credentials for anything behind a login, and Evulto gates most of the app —
-- Form Coach, physique check-ins, the food scanner and the reward system are all
-- Pro or Legend. A reviewer given a free account sees paywalls where the store
-- listing promises features, which is a common rejection reason.
--
-- It is also the only practical way to exercise the camera and voice paths
-- without spending money or touching a real customer's account.
--
-- HOW: the same mechanism as 027 — a comp grant through the normal entitlement
-- columns, so the client and the edge functions agree because they read the same
-- row. Nothing about this is special-cased in app code.
--
-- BEFORE RUNNING: the account must already EXIST. Sign it up through the app
-- (or the Supabase dashboard) first, confirm the email, then apply this. The
-- UPDATE matches on auth.users.email and quietly does nothing if it is absent —
-- so a wrong address here fails silently, and the NOTICE at the end is how you
-- tell the difference.
--
-- CHOOSING THE ADDRESS: "Confirm email" is enabled on this project, so the demo
-- address must be able to RECEIVE mail. A Gmail plus-alias is the least effort:
-- mail to name+demo@gmail.com is delivered to name@gmail.com, while Supabase
-- treats it as a distinct account. Change the constant below to whatever you
-- actually signed up.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  -- ↓↓↓ SET THIS to the address you signed the demo account up with ↓↓↓
  v_demo_email TEXT := 'skillupstudents.learnnearn+demo@gmail.com';
  v_updated    INTEGER;
  v_exists     BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(v_demo_email))
    INTO v_exists;

  IF NOT v_exists THEN
    RAISE NOTICE 'demo account: % does not exist yet — sign it up in the app, confirm the email, then re-run this migration', v_demo_email;
    RETURN;
  END IF;

  UPDATE public.profiles p
     SET subscription_tier       = 'legend',
         subscription_expires_at = NULL,          -- NULL = no expiry (comp)
         subscription_provider   = 'comp',
         subscription_product_id = 'demo_review',
         subscription_updated_at = NOW()
    FROM auth.users u
   WHERE u.id = p.id
     AND LOWER(u.email) = LOWER(v_demo_email)
     -- Never clobber a real purchase, on the off chance this address ever buys.
     AND (p.subscription_provider IS NULL
          OR p.subscription_provider IN ('comp', 'none', ''));

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE NOTICE 'demo account: user exists but no profile row was updated (profile missing, or already on a paid provider)';
  ELSE
    RAISE NOTICE 'demo account: % granted legend (comp, no expiry)', v_demo_email;
  END IF;
END
$$;
