-- ─────────────────────────────────────────────────────────────────────────────
-- 012 — Lock down waitlist PII exposure via anon key
--
-- BACKGROUND: Migration 010 created a permissive "Public count" SELECT policy
-- that lets anyone with the anon key SELECT every row of waitlist (intended:
-- count-only for the upsell page counter; actual: full row read of every email).
-- Per V2 master-plan §6 audit point #4: "Verify anon RLS can't read PII."
--
-- FIX: Replace the open SELECT policy with a security definer RPC that returns
-- ONLY the integer count. Drop the broad SELECT entirely. The upsell page
-- + index hero counter switch to calling the RPC instead of a HEAD count.
--
-- vanguard_orders count is still safe to expose since its policy already
-- filters to status='paid' only, and that table contains no email by itself
-- that wasn't already opt-in to public Vanguard claim (we may revisit if
-- pseudonyms are needed).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the over-permissive SELECT policy
DROP POLICY IF EXISTS "Public count" ON public.waitlist;
DROP POLICY IF EXISTS waitlist_no_public_read ON public.waitlist;

-- 2. NEW: no anon/authenticated SELECT at all on the table
-- (authenticated users won't have waitlist access either; admins use a
-- separate service-role-protected admin tool)

-- 3. Public count RPC — returns just an integer, no rows leaked
CREATE OR REPLACE FUNCTION public.waitlist_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.waitlist;
$$;

GRANT EXECUTE ON FUNCTION public.waitlist_count() TO anon, authenticated;

-- 4. Public vanguard claimed count RPC — returns paid order count
-- (also avoid relying on RLS for this since policy can drift)
CREATE OR REPLACE FUNCTION public.vanguard_claimed_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.vanguard_orders WHERE status = 'paid';
$$;

GRANT EXECUTE ON FUNCTION public.vanguard_claimed_count() TO anon, authenticated;

-- 5. Lock the vanguard_orders SELECT down to ZERO rows for anon
-- (we use the RPC above for the count; no need to expose row content)
DROP POLICY IF EXISTS "Public count vanguard orders" ON public.vanguard_orders;

-- 6. Note for future admin tool: it must use the service_role key (server-side
-- only — never embed in client JS) OR sit behind Supabase Auth with a custom
-- claim that gates an admin-only SELECT policy. Do NOT add back a permissive
-- anon SELECT to either table.
