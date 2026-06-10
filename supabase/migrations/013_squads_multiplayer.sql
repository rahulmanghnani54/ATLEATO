-- ─────────────────────────────────────────────────────────────────────────────
-- 013 — Squads multiplayer (V2 plan §5 ADD #1: "the moat")
--
-- Until now squads was a solo UI with hard-coded mock leaderboards. This
-- migration creates the real backing schema so users can:
--   • Join one squad at a time (auto-suggested from their active coach)
--   • Contribute weekly volume that's actually counted
--   • See a real leaderboard of fellow squad members
--   • Get realtime updates as squadmates log workouts
--
-- Anonymity by default: members are displayed via a stable per-squad
-- pseudonymous handle (Lifter #XXXX), not their real email/name. Users
-- can opt-in to show their display_name later (out of scope here).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. squads — the 5 coach-persona squads ──
CREATE TABLE IF NOT EXISTS public.squads (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_key   TEXT         NOT NULL UNIQUE,   -- 'sculptor' | 'monument' | 'analyst' | 'commander' | 'architect'
  name          TEXT         NOT NULL,
  description   TEXT         NOT NULL,
  accent_color  TEXT         NOT NULL,
  member_count  INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Squads readable to all auth users" ON public.squads;
CREATE POLICY "Squads readable to all auth users" ON public.squads
  FOR SELECT TO authenticated USING (true);

-- Seed the 5 squads (idempotent)
INSERT INTO public.squads (persona_key, name, description, accent_color) VALUES
  ('sculptor',  'The Sculptor Squad',   'Aesthetic over numbers. PPL discipline. Build the statue.', '#dfff1f'),
  ('monument',  'The Monument Squad',   'High volume. Pump the iron. Never skip a meal.',           '#f5b942'),
  ('analyst',   'The Analyst Squad',    'Evidence-driven. RIR-tracked. Run the protocol.',          '#5DD3FA'),
  ('commander', 'The Commander Squad',  'Heavy raw intensity. No excuses. Answer the call.',        '#ef4444'),
  ('architect', 'The Architect Squad',  'Periodization. Volume landmarks. Grow by design.',         '#7be38c')
ON CONFLICT (persona_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  accent_color = EXCLUDED.accent_color;

-- ── 2. squad_members — who's in which squad + their current week volume ──
CREATE TABLE IF NOT EXISTS public.squad_members (
  id                  BIGSERIAL    PRIMARY KEY,
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  squad_id            UUID         NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  weekly_volume_kg    INTEGER      NOT NULL DEFAULT 0,
  week_start_date     DATE         NOT NULL,                  -- the Monday of the current tracking week
  joined_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Anonymized handle for leaderboards: stable per (user, squad), like 'Lifter #4821'
  anon_handle         TEXT         NOT NULL,
  UNIQUE (user_id)        -- one squad at a time per user
);

CREATE INDEX IF NOT EXISTS squad_members_squad_volume_idx
  ON public.squad_members (squad_id, week_start_date, weekly_volume_kg DESC);

ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own row" ON public.squad_members;
CREATE POLICY "Members can read own row" ON public.squad_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can update own row" ON public.squad_members;
CREATE POLICY "Members can update own row" ON public.squad_members
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can delete own row" ON public.squad_members;
CREATE POLICY "Members can delete own row" ON public.squad_members
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── 3. squad_volume_log — historical record for trends / past weeks ──
CREATE TABLE IF NOT EXISTS public.squad_volume_log (
  id                BIGSERIAL    PRIMARY KEY,
  user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  squad_id          UUID         NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  week_start_date   DATE         NOT NULL,
  volume_kg         INTEGER      NOT NULL,
  recorded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS squad_volume_log_squad_week_idx
  ON public.squad_volume_log (squad_id, week_start_date);

ALTER TABLE public.squad_volume_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own volume log" ON public.squad_volume_log;
CREATE POLICY "Members can read own volume log" ON public.squad_volume_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 4. Helper: pick the Monday of the current week (UTC) ──
CREATE OR REPLACE FUNCTION public.current_week_start()
RETURNS DATE
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (date_trunc('week', (NOW() AT TIME ZONE 'UTC'))::DATE);
$$;

-- ── 5. RPC: join a squad (one at a time per user) ──
CREATE OR REPLACE FUNCTION public.join_squad(p_persona_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_squad_id UUID;
  v_handle   TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT id INTO v_squad_id FROM public.squads WHERE persona_key = p_persona_key;
  IF v_squad_id IS NULL THEN RAISE EXCEPTION 'unknown persona_key: %', p_persona_key; END IF;

  -- Stable anonymized handle, deterministic from (user_id, squad_id)
  v_handle := 'Lifter #' || LPAD(
    ((ABS(HASHTEXT(v_user_id::TEXT || v_squad_id::TEXT)) % 9000) + 1000)::TEXT,
    4, '0'
  );

  -- Upsert: if user already in a squad, switch them. If same squad, no-op.
  INSERT INTO public.squad_members (user_id, squad_id, weekly_volume_kg, week_start_date, anon_handle)
  VALUES (v_user_id, v_squad_id, 0, current_week_start(), v_handle)
  ON CONFLICT (user_id) DO UPDATE
    SET squad_id          = EXCLUDED.squad_id,
        weekly_volume_kg  = CASE WHEN squad_members.squad_id = EXCLUDED.squad_id THEN squad_members.weekly_volume_kg ELSE 0 END,
        week_start_date   = current_week_start(),
        anon_handle       = EXCLUDED.anon_handle;

  -- Refresh denormalized member_count on squads (cheap full recount)
  UPDATE public.squads s
  SET member_count = (SELECT COUNT(*) FROM public.squad_members m WHERE m.squad_id = s.id);

  RETURN v_squad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_squad(TEXT) TO authenticated;

-- ── 6. RPC: submit weekly volume contribution (call this after each workout) ──
CREATE OR REPLACE FUNCTION public.submit_squad_volume(p_volume_kg INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_week      DATE := current_week_start();
  v_squad_id  UUID;
  v_new_total INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_volume_kg <= 0 OR p_volume_kg > 50000 THEN RETURN 0; END IF;  -- sanity bounds

  SELECT squad_id INTO v_squad_id FROM public.squad_members WHERE user_id = v_user_id;
  IF v_squad_id IS NULL THEN RETURN 0; END IF;  -- not in a squad → no-op

  -- Roll over week if needed: if stored week is older than current, reset weekly volume
  UPDATE public.squad_members
    SET
      weekly_volume_kg = CASE WHEN week_start_date < v_week THEN p_volume_kg
                              ELSE weekly_volume_kg + p_volume_kg END,
      week_start_date  = v_week
    WHERE user_id = v_user_id
    RETURNING weekly_volume_kg INTO v_new_total;

  -- Always log to the historical table
  INSERT INTO public.squad_volume_log (user_id, squad_id, week_start_date, volume_kg)
  VALUES (v_user_id, v_squad_id, v_week, p_volume_kg);

  RETURN v_new_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_squad_volume(INTEGER) TO authenticated;

-- ── 7. RPC: leaderboard for the user's current squad (top N for the week) ──
CREATE OR REPLACE FUNCTION public.squad_leaderboard(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  anon_handle      TEXT,
  weekly_volume_kg INTEGER,
  is_current_user  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_squad_id UUID;
  v_week     DATE := current_week_start();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT squad_id INTO v_squad_id FROM public.squad_members WHERE user_id = v_user_id;
  IF v_squad_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    m.anon_handle,
    CASE WHEN m.week_start_date = v_week THEN m.weekly_volume_kg ELSE 0 END,
    (m.user_id = v_user_id)
  FROM public.squad_members m
  WHERE m.squad_id = v_squad_id
  ORDER BY (CASE WHEN m.week_start_date = v_week THEN m.weekly_volume_kg ELSE 0 END) DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.squad_leaderboard(INTEGER) TO authenticated;

-- ── 8. RPC: which squad am I in? (one query for app boot) ──
CREATE OR REPLACE FUNCTION public.my_squad()
RETURNS TABLE (
  squad_id          UUID,
  persona_key       TEXT,
  name              TEXT,
  accent_color      TEXT,
  member_count      INTEGER,
  weekly_volume_kg  INTEGER,
  anon_handle       TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.persona_key, s.name, s.accent_color, s.member_count,
         CASE WHEN m.week_start_date = current_week_start() THEN m.weekly_volume_kg ELSE 0 END,
         m.anon_handle
  FROM public.squad_members m
  JOIN public.squads s ON s.id = m.squad_id
  WHERE m.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_squad() TO authenticated;

-- ── 9. Realtime: enable Supabase Realtime broadcasting for squad_members ──
-- App subscribes to squad_members changes filtered by squad_id to see live
-- leaderboard updates as squadmates log workouts.
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_members;
