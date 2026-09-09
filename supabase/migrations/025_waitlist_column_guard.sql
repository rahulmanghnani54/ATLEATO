-- ─────────────────────────────────────────────────────────────────────────────
-- 025 — Stop anonymous callers writing privileged waitlist columns
--
-- THE HOLE: 010 created
--     CREATE POLICY "Public insert" ON public.waitlist
--       FOR INSERT TO anon, authenticated WITH CHECK (true);
-- which is correct for what it was written for — the marketing form on
-- docs/index.html POSTs straight to /rest/v1/waitlist with the public anon key,
-- and the row genuinely is anonymous.
--
-- But RLS is a ROW filter, not a column filter. WITH CHECK (true) accepts any
-- column present in the request body, and 011 later added is_vanguard /
-- vanguard_pass_no / vanguard_at to this table. So anyone with the anon key —
-- which ships in the APK and is printed on a public docs page — could POST
--     {"email":"x@y.z","is_vanguard":true,"vanguard_pass_no":7}
-- and mint themselves a founding Vanguard pass, which 011's own header and the
-- confirmation email say converts to a free Legend month at launch. They could
-- also burn all 500 pass numbers, or scribble over the drip-send timestamps
-- from 017 to re-trigger or suppress the email sequence.
--
-- 019's trigger did not stop it: that one only normalises `email`, and it was
-- written before these columns existed.
--
-- THE FIX: a BEFORE INSERT OR UPDATE trigger that forces every privileged
-- column back to its server-owned value whenever the writer is a client role.
-- Deliberately the same shape as guard_profile_entitlement() in 023 — same
-- reasoning, same SECURITY INVOKER so that SECURITY DEFINER writers
-- (assign_next_vanguard_pass_no, the Lemon Squeezy webhook) still pass through.
--
-- Silently reverting rather than raising keeps the public form working exactly
-- as it does today: a legitimate POST carries none of these fields, so nothing
-- about the happy path changes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_waitlist_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only client roles are constrained. service_role (webhooks, admin tooling)
  -- and SECURITY DEFINER functions must still be able to grant a pass.
  IF CURRENT_USER NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A brand-new signup is never a Vanguard and has never been mailed.
    NEW.is_vanguard       := FALSE;
    NEW.vanguard_pass_no  := NULL;
    NEW.vanguard_at       := NULL;
    NEW.drip_day2_sent_at := NULL;
    NEW.drip_day5_sent_at := NULL;
    NEW.drip_day9_sent_at := NULL;
  ELSE
    -- On UPDATE, hold every privileged column at whatever the server last set.
    NEW.is_vanguard       := OLD.is_vanguard;
    NEW.vanguard_pass_no  := OLD.vanguard_pass_no;
    NEW.vanguard_at       := OLD.vanguard_at;
    NEW.drip_day2_sent_at := OLD.drip_day2_sent_at;
    NEW.drip_day5_sent_at := OLD.drip_day5_sent_at;
    NEW.drip_day9_sent_at := OLD.drip_day9_sent_at;
    -- id and created_at are identity/provenance; a client may not rewrite them.
    NEW.id                := OLD.id;
    NEW.created_at        := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_guard_privileged ON public.waitlist;
CREATE TRIGGER waitlist_guard_privileged
  BEFORE INSERT OR UPDATE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.guard_waitlist_privileged_columns();

-- Defence in depth: column-level INSERT privileges are the hard boundary, the
-- trigger is the belt. A client can now only NAME these columns; anything else
-- is rejected by Postgres before RLS is even consulted.
--
-- NOTE the ordering: REVOKE the table-wide grant first, or the column grants
-- are subsumed by it and achieve nothing.
REVOKE INSERT, UPDATE ON public.waitlist FROM anon, authenticated;
GRANT INSERT (email, source, referrer, user_agent) ON public.waitlist TO anon, authenticated;

-- The vanguard pass counter must not be enumerable by burning it: 011 already
-- REVOKEs assign_next_vanguard_pass_no() from client roles, so this file only
-- has to close the direct-write path it was protecting.
