-- ─────────────────────────────────────────────────────────────────────────────
-- 015 — Real referral attribution count
--
-- BACKGROUND: The app's /referral screen showed a FAKE counter (a local
-- AsyncStorage integer bumped on every Share tap — see referral.tsx). Real
-- referral signups ARE captured: the landing page writes the referrer's code
-- into waitlist.source as '<base>_ref_<CODE>' (main.js). But the table is
-- RLS-locked to count-only RPCs (migration 012), so the client can't read
-- those rows directly.
--
-- FIX: a SECURITY DEFINER count RPC that returns ONLY an integer — how many
-- waitlist signups carry a given referral code. No PII leaked (same pattern
-- as waitlist_count / vanguard_claimed_count).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.referral_count(p_code TEXT)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- Match any source ending in the literal '_ref_<CODE>'. The underscores are
  -- escaped (ESCAPE '\') so they're literal, not LIKE wildcards. Both sides
  -- upper-cased so attribution is case-insensitive. Codes are hex (0-9A-F),
  -- so they can't contain LIKE metacharacters.
  SELECT COUNT(*)::INTEGER
  FROM public.waitlist
  WHERE p_code IS NOT NULL
    AND length(p_code) > 0
    AND UPPER(source) LIKE '%\_REF\_' || UPPER(p_code) ESCAPE '\';
$$;

GRANT EXECUTE ON FUNCTION public.referral_count(TEXT) TO anon, authenticated;
