-- ─────────────────────────────────────────────────────────────────────────────
-- Waitlist — anonymous email capture from the marketing site (atleato.com).
--
-- Public form on docs/index.html POSTs to Supabase via the anon key. RLS
-- allows INSERT only — nobody (not even authenticated users) can SELECT
-- the table. The owner reads it via the dashboard / service-role.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.waitlist (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  source      TEXT,            -- 'landing-page' / 'ad-campaign-x' / …
  referrer    TEXT,            -- document.referrer
  user_agent  TEXT,            -- navigator.userAgent
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique
  ON public.waitlist (LOWER(email));

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (no auth required) — anon key in JS does the call.
DROP POLICY IF EXISTS waitlist_public_insert ON public.waitlist;
CREATE POLICY waitlist_public_insert
  ON public.waitlist FOR INSERT
  WITH CHECK (true);

-- Nobody can SELECT via the API — only service-role / dashboard.
-- (Default RLS deny when no SELECT policy exists, but be explicit.)
DROP POLICY IF EXISTS waitlist_no_public_read ON public.waitlist;
-- (no SELECT policy = effectively no read access via anon/authenticated)
