-- ─────────────────────────────────────────────────────────────────────────────
-- 019 — Waitlist anti-abuse: email normalization + disposable-domain block
--
-- The LOWER(email) unique index (mig 010) only stops the EXACT same address.
-- One person can still flood the list with:
--   1. disposable emails (10minutemail / mailinator / synsky / etc.)
--   2. gmail aliases — you+1@gmail, you+2@gmail, y.o.u@gmail all hit the same
--      inbox but are distinct strings, so they dodge the unique index
-- The client rate-limit is localStorage-only and trivially bypassed.
--
-- This adds SERVER-ENFORCED protection (a BEFORE INSERT/UPDATE trigger — runs no
-- matter how the row is inserted, REST or otherwise):
--   • normalizes the address into email_normalized (gmail: strip dots + +tag)
--   • a UNIQUE index on email_normalized collapses all aliases to one signup
--   • rejects known disposable domains outright
--
-- NOTE: a domain blocklist is partial — temp-mail providers rotate domains.
-- The complete fix is double-opt-in confirmation and/or a CAPTCHA on the form;
-- this cuts the easy, high-volume abuse path. See app notes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS email_normalized TEXT;

CREATE OR REPLACE FUNCTION public.waitlist_normalize_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_email  TEXT := lower(trim(NEW.email));
  v_local  TEXT;
  v_domain TEXT;
  -- Common disposable / throwaway providers. Extend as new ones surface.
  v_blocked TEXT[] := ARRAY[
    'mailinator.com','10minutemail.com','10minemail.com','guerrillamail.com',
    'guerrillamail.info','grr.la','sharklasers.com','yopmail.com','temp-mail.org',
    'tempmail.com','throwawaymail.com','getnada.com','trashmail.com','maildrop.cc',
    'dispostable.com','fakeinbox.com','mailnesia.com','mohmal.com','synsky.com',
    'tmpeml.com','emailondeck.com','spamgourmet.com','mintemail.com','tempmailo.com'
  ];
BEGIN
  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;

  v_local  := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  IF v_domain = ANY(v_blocked) THEN
    RAISE EXCEPTION 'disposable email addresses are not allowed';
  END IF;

  -- Gmail ignores dots and +tags — collapse them so aliases = one signup.
  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := replace(v_local, '.', '');
    v_local := split_part(v_local, '+', 1);
    v_domain := 'gmail.com';
  ELSE
    -- For other providers, still collapse +tags (widely supported).
    v_local := split_part(v_local, '+', 1);
  END IF;

  NEW.email := v_email;                     -- store cleaned original for delivery
  NEW.email_normalized := v_local || '@' || v_domain;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waitlist_normalize_guard ON public.waitlist;
CREATE TRIGGER trg_waitlist_normalize_guard
  BEFORE INSERT OR UPDATE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.waitlist_normalize_guard();

-- Backfill existing rows (best-effort: just normalize, keep their domains).
UPDATE public.waitlist
SET email_normalized = (
  CASE
    WHEN split_part(lower(email), '@', 2) IN ('gmail.com','googlemail.com')
      THEN split_part(replace(split_part(lower(email),'@',1), '.', ''), '+', 1) || '@gmail.com'
    ELSE split_part(split_part(lower(email),'@',1), '+', 1) || '@' || split_part(lower(email),'@',2)
  END
)
WHERE email_normalized IS NULL;

-- Enforce one signup per normalized address. If this errors, there are existing
-- alias-duplicates to dedupe first (unlikely on a small pre-launch list).
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_normalized_idx
  ON public.waitlist (email_normalized);
