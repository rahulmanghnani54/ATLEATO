-- ─────────────────────────────────────────────────────────────────────────────
-- Vanguard purchases — Lemon Squeezy webhook writes here on every paid order.
--
-- When a buyer completes the $1.99 VIP Vanguard Pass checkout, Lemon Squeezy
-- POSTs to /functions/v1/lemonsqueezy-webhook. That function:
--   1) Verifies the X-Signature header against LEMONSQUEEZY_WEBHOOK_SECRET
--   2) Inserts a row into public.vanguard_orders (this table)
--   3) Sets waitlist.is_vanguard = true for the matching email (if found)
--   4) Sends a personalized "You're a Vanguard" confirmation via Resend
--
-- Idempotency: Lemon Squeezy may retry on transient failures, so we key on
-- the LS order identifier (UNIQUE) — duplicate webhooks become no-ops.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add vanguard flag to waitlist ───
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS is_vanguard      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vanguard_pass_no INTEGER,
  ADD COLUMN IF NOT EXISTS vanguard_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS waitlist_vanguard_idx
  ON public.waitlist (is_vanguard) WHERE is_vanguard = TRUE;

-- Unique pass number 1-500 (NULL allowed for non-vanguards, but unique among set)
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_vanguard_pass_no_idx
  ON public.waitlist (vanguard_pass_no) WHERE vanguard_pass_no IS NOT NULL;

-- ─── 2. Order ledger ───
CREATE TABLE IF NOT EXISTS public.vanguard_orders (
  id                BIGSERIAL PRIMARY KEY,
  ls_order_id       TEXT        NOT NULL UNIQUE,          -- Lemon Squeezy order identifier
  ls_order_number   TEXT,                                 -- Human-readable order #
  ls_event          TEXT        NOT NULL,                 -- 'order_created', 'order_refunded', etc.
  ls_customer_id    TEXT,
  email             TEXT        NOT NULL,
  customer_name     TEXT,
  product_id        TEXT,
  variant_id        TEXT,
  total_cents       INTEGER     NOT NULL,                 -- e.g. 199 for $1.99
  currency          TEXT        NOT NULL DEFAULT 'USD',
  status            TEXT        NOT NULL,                 -- 'paid', 'refunded', 'failed', etc.
  test_mode         BOOLEAN     NOT NULL DEFAULT FALSE,
  pass_no           INTEGER,                              -- 1-500 assigned at insert time
  raw_payload       JSONB       NOT NULL,                 -- Full LS webhook body for debugging
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS vanguard_orders_email_idx ON public.vanguard_orders (LOWER(email));
CREATE INDEX IF NOT EXISTS vanguard_orders_created_at_idx ON public.vanguard_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS vanguard_orders_status_idx ON public.vanguard_orders (status);

ALTER TABLE public.vanguard_orders ENABLE ROW LEVEL SECURITY;

-- Only the service_role (used by the edge function) can write.
-- Anon can SELECT count() for the upsell page "X of 500 claimed" counter.
DROP POLICY IF EXISTS "Public count vanguard orders" ON public.vanguard_orders;
CREATE POLICY "Public count vanguard orders" ON public.vanguard_orders
  FOR SELECT TO anon, authenticated
  USING (status = 'paid');

-- ─── 3. Next pass number helper (atomic, race-safe) ───
-- Returns 1-500. Returns NULL if all 500 are claimed.
CREATE OR REPLACE FUNCTION public.assign_next_vanguard_pass_no()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_no INTEGER;
BEGIN
  -- Find the lowest unused integer in [1, 500]
  SELECT n INTO next_no
  FROM generate_series(1, 500) AS n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.waitlist w WHERE w.vanguard_pass_no = n
  )
  ORDER BY n
  LIMIT 1;
  RETURN next_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_next_vanguard_pass_no() TO service_role;
