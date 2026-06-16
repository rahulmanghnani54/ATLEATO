-- ─────────────────────────────────────────────────────────────────────────────
-- 019 — Waitlist anti-abuse: email normalization + disposable-domain block
--
-- The LOWER(email) unique index (mig 010) only stops the EXACT same address.
-- One person can still flood the list with disposable emails (10minutemail /
-- mailinator / synsky / etc.) or gmail aliases (you+1@, y.o.u@ → one inbox,
-- distinct strings). The client rate-limit is localStorage-only.
--
-- SERVER-ENFORCED fix:
--   • waitlist_normalize_email(): pure normalizer (gmail strips dots + +tag).
--   • email_normalized column + UNIQUE index → all aliases collapse to one.
--   • BEFORE INSERT guard trigger → normalizes + rejects disposable domains.
--
-- IMPORTANT (fixes the v1 failure): the guard fires on INSERT ONLY. A trigger
-- on UPDATE re-validated existing rows during backfill and aborted on old
-- disposable test rows — and would also break legitimate updates (e.g. the
-- Lemon Squeezy webhook setting is_vanguard). Backfill uses the pure normalizer
-- directly so existing disposable rows are kept (grandfathered), not rejected.
--
-- NOTE: a domain blocklist is partial — temp-mail providers rotate domains.
-- The complete fix is double-opt-in confirmation and/or a CAPTCHA on the form.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS email_normalized TEXT;

-- Pure normalizer — never raises. Used by both backfill and the insert guard.
CREATE OR REPLACE FUNCTION public.waitlist_normalize_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  e TEXT := lower(trim(p_email));
  l TEXT;
  d TEXT;
BEGIN
  IF e IS NULL OR position('@' in e) = 0 THEN RETURN e; END IF;
  l := split_part(e, '@', 1);
  d := split_part(e, '@', 2);
  IF d IN ('gmail.com', 'googlemail.com') THEN
    l := replace(l, '.', '');
    l := split_part(l, '+', 1);
    d := 'gmail.com';
  ELSE
    l := split_part(l, '+', 1);
  END IF;
  RETURN l || '@' || d;
END;
$$;

-- Backfill existing rows directly (does NOT go through the guard trigger).
UPDATE public.waitlist
SET email_normalized = public.waitlist_normalize_email(email)
WHERE email_normalized IS NULL;

-- Dedup any existing normalized collisions (keep the earliest signup) so the
-- unique index below can be created without error.
DELETE FROM public.waitlist a
USING public.waitlist b
WHERE a.email_normalized = b.email_normalized
  AND a.id > b.id;

-- One signup per normalized address.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_normalized_idx
  ON public.waitlist (email_normalized);

-- Guard for NEW signups only: normalize + reject disposable domains.
CREATE OR REPLACE FUNCTION public.waitlist_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  e TEXT := lower(trim(NEW.email));
  d TEXT;
  v_blocked TEXT[] := ARRAY[
    'mailinator.com','10minutemail.com','10minemail.com','guerrillamail.com',
    'guerrillamail.info','grr.la','sharklasers.com','yopmail.com','temp-mail.org',
    'tempmail.com','throwawaymail.com','getnada.com','trashmail.com','maildrop.cc',
    'dispostable.com','fakeinbox.com','mailnesia.com','mohmal.com','synsky.com',
    'tmpeml.com','emailondeck.com','spamgourmet.com','mintemail.com','tempmailo.com'
  ];
BEGIN
  IF e IS NULL OR position('@' in e) = 0 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  d := split_part(e, '@', 2);
  IF d = ANY(v_blocked) THEN
    RAISE EXCEPTION 'disposable email addresses are not allowed';
  END IF;
  NEW.email := e;
  NEW.email_normalized := public.waitlist_normalize_email(e);
  RETURN NEW;
END;
$$;

-- Drop any prior trigger name, then create the INSERT-only guard.
DROP TRIGGER IF EXISTS trg_waitlist_normalize_guard ON public.waitlist;
DROP TRIGGER IF EXISTS trg_waitlist_insert_guard ON public.waitlist;
CREATE TRIGGER trg_waitlist_insert_guard
  BEFORE INSERT ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.waitlist_insert_guard();
