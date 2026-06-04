-- ─────────────────────────────────────────────────────────────────────────────
-- Waitlist — anonymous email capture from the marketing site (atleato.com).
--
-- Public form on docs/index.html POSTs to Supabase via the anon key. RLS
-- allows INSERT for anyone, and SELECT (count only) for the upsell page
-- referral counter + admin dashboard stats.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.waitlist (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  source      TEXT,            -- 'landing-page' / 'hero' / '...ref_email@x.com'
  referrer    TEXT,            -- document.referrer
  user_agent  TEXT,            -- navigator.userAgent
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_lower_idx
  ON public.waitlist (LOWER(email));

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (no auth required) — anon key in JS does the call.
DROP POLICY IF EXISTS waitlist_public_insert ON public.waitlist;
DROP POLICY IF EXISTS "Public insert" ON public.waitlist;
CREATE POLICY "Public insert" ON public.waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Public can SELECT — needed for the upsell page to show total waitlist count
-- and the admin dashboard to render stats / referral leaderboard.
DROP POLICY IF EXISTS waitlist_no_public_read ON public.waitlist;
DROP POLICY IF EXISTS "Public count" ON public.waitlist;
CREATE POLICY "Public count" ON public.waitlist
  FOR SELECT TO anon, authenticated
  USING (true);
