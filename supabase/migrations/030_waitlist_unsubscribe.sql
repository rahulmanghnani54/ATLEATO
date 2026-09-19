-- ─────────────────────────────────────────────────────────────────────────────
-- 030 — Waitlist unsubscribe suppression
--
-- The Day 2/5/9 drip (send-drip-emails) had no way to stop emailing someone who
-- asked to be removed: the only unsubscribe path was a mailto handled by hand,
-- and the sender's "who's due" query filtered only on created_at + is_vanguard.
-- The privacy policy (docs/privacy.html §2.11) tells people they can unsubscribe
-- and we honour it, so the sender must actually skip suppressed rows.
--
-- This adds an unsubscribed_at stamp. Setting it (support marking a mailto/reply
-- request, or a future one-click endpoint) removes the row from every remaining
-- drip step. The welcome email is transactional and unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Rebuild the drip "due" partial indexes to also exclude unsubscribed rows, so
-- the daily scan never even considers them.
DROP INDEX IF EXISTS public.waitlist_drip2_due_idx;
DROP INDEX IF EXISTS public.waitlist_drip5_due_idx;
DROP INDEX IF EXISTS public.waitlist_drip9_due_idx;
CREATE INDEX IF NOT EXISTS waitlist_drip2_due_idx
  ON public.waitlist (created_at) WHERE drip_day2_sent_at IS NULL AND unsubscribed_at IS NULL;
CREATE INDEX IF NOT EXISTS waitlist_drip5_due_idx
  ON public.waitlist (created_at) WHERE drip_day5_sent_at IS NULL AND unsubscribed_at IS NULL;
CREATE INDEX IF NOT EXISTS waitlist_drip9_due_idx
  ON public.waitlist (created_at) WHERE drip_day9_sent_at IS NULL AND unsubscribed_at IS NULL;
