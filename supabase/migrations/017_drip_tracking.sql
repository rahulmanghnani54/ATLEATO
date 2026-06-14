-- ─────────────────────────────────────────────────────────────────────────────
-- 017 — Drip email tracking
--
-- The send-welcome-email function fires once on signup. This adds the 3-step
-- nurture sequence (Day 2 / Day 5 / Day 9). The send-drip-emails edge function
-- runs daily (pg_cron), finds rows that are due for the next drip and haven't
-- received it, sends via Resend, and stamps the *_sent_at column so each drip
-- goes out exactly once per person.
--
-- is_vanguard already exists (migration 011) — the drip sender skips anyone
-- who's already bought a Vanguard pass (no need to keep selling them).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS drip_day2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drip_day5_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drip_day9_sent_at TIMESTAMPTZ;

-- Partial indexes so the daily "who's due" scan stays cheap as the list grows
-- (only rows that haven't received each drip are indexed).
CREATE INDEX IF NOT EXISTS waitlist_drip2_due_idx
  ON public.waitlist (created_at) WHERE drip_day2_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS waitlist_drip5_due_idx
  ON public.waitlist (created_at) WHERE drip_day5_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS waitlist_drip9_due_idx
  ON public.waitlist (created_at) WHERE drip_day9_sent_at IS NULL;
