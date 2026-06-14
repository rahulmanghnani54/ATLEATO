-- ── Migration 014: fix UPDATE-without-WHERE in join_squad RPC ──
-- Supabase rejects unconditional UPDATE statements (even inside
-- SECURITY DEFINER functions) when the policy guard is on, surfacing as
-- "UPDATE requires a WHERE clause" to the client.
--
-- Original RPC (013) ran:
--   UPDATE public.squads s
--   SET member_count = (SELECT COUNT(*) FROM squad_members m WHERE m.squad_id = s.id);
-- which touches every squad row. The intent was just to refresh the
-- count of the squad the user is joining, and (if they switched) the
-- squad they just left. Capturing both before/after squad_ids lets us
-- scope the UPDATE to at most two rows.

CREATE OR REPLACE FUNCTION public.join_squad(p_persona_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_squad_id    UUID;
  v_old_squad   UUID;
  v_handle      TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT id INTO v_squad_id FROM public.squads WHERE persona_key = p_persona_key;
  IF v_squad_id IS NULL THEN RAISE EXCEPTION 'unknown persona_key: %', p_persona_key; END IF;

  -- Remember the user's current squad (if any) so we can recount it too.
  SELECT squad_id INTO v_old_squad
    FROM public.squad_members
    WHERE user_id = v_user_id;

  v_handle := 'Lifter #' || LPAD(
    ((ABS(HASHTEXT(v_user_id::TEXT || v_squad_id::TEXT)) % 9000) + 1000)::TEXT,
    4, '0'
  );

  INSERT INTO public.squad_members (user_id, squad_id, weekly_volume_kg, week_start_date, anon_handle)
  VALUES (v_user_id, v_squad_id, 0, current_week_start(), v_handle)
  ON CONFLICT (user_id) DO UPDATE
    SET squad_id          = EXCLUDED.squad_id,
        weekly_volume_kg  = CASE WHEN squad_members.squad_id = EXCLUDED.squad_id
                                 THEN squad_members.weekly_volume_kg ELSE 0 END,
        week_start_date   = current_week_start(),
        anon_handle       = EXCLUDED.anon_handle;

  -- Recount only the squads whose membership actually changed:
  -- the new squad always, plus the old squad if the user switched.
  UPDATE public.squads s
  SET member_count = (SELECT COUNT(*) FROM public.squad_members m WHERE m.squad_id = s.id)
  WHERE s.id = v_squad_id
     OR (v_old_squad IS NOT NULL AND v_old_squad <> v_squad_id AND s.id = v_old_squad);

  RETURN v_squad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_squad(TEXT) TO authenticated;
