
-- Wave 4: Battler tools — battle-level moderation controls

-- 1. New column: comments_locked
ALTER TABLE public.live_battles
  ADD COLUMN IF NOT EXISTS comments_locked boolean NOT NULL DEFAULT false;

-- 2. Helper: does a body match any of a battle's keyword filters?
--    Case-insensitive substring match. Empty / non-array filter lists always
--    return false so this can be reused safely from policies.
CREATE OR REPLACE FUNCTION public.live_battle_body_matches_keyword(_battle_id uuid, _body text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kw text;
  filters jsonb;
BEGIN
  SELECT keyword_filters INTO filters
    FROM public.live_battles
    WHERE id = _battle_id;
  IF filters IS NULL OR jsonb_typeof(filters) <> 'array' OR jsonb_array_length(filters) = 0 THEN
    RETURN false;
  END IF;
  FOR kw IN SELECT jsonb_array_elements_text(filters) LOOP
    IF kw IS NOT NULL AND length(btrim(kw)) > 0
       AND position(lower(btrim(kw)) IN lower(_body)) > 0 THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.live_battle_body_matches_keyword(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_battle_body_matches_keyword(uuid, text) TO authenticated, service_role;

-- 3. Tighten the comment insert policy to respect the new controls.
DROP POLICY IF EXISTS "live_battle_comments_insert_self_while_live" ON public.live_battle_comments;

CREATE POLICY "live_battle_comments_insert_self_while_live"
  ON public.live_battle_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.live_battles b
       WHERE b.id = battle_id
         AND b.status = 'live'
         AND b.comments_locked = false
    )
    AND public.live_battle_body_matches_keyword(battle_id, body) = false
    AND (
      -- Slow mode: caller's most recent comment on this battle is older than
      -- the battle's configured slow_mode_seconds (0 disables the check).
      (SELECT slow_mode_seconds FROM public.live_battles WHERE id = battle_id) = 0
      OR NOT EXISTS (
        SELECT 1
          FROM public.live_battle_comments c
         WHERE c.battle_id = battle_id
           AND c.user_id = auth.uid()
           AND c.created_at > now() - (
             (SELECT slow_mode_seconds FROM public.live_battles WHERE id = battle_id)::text || ' seconds'
           )::interval
      )
    )
  );

-- 4. RPC: host or moderator updates battle-level moderation controls.
CREATE OR REPLACE FUNCTION public.set_battle_moderation(
  _battle_id uuid,
  _comments_locked boolean,
  _slow_mode_seconds integer,
  _keyword_filters jsonb
)
RETURNS public.live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.live_battles;
  caller uuid := auth.uid();
  is_mod boolean;
  cleaned jsonb;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;

  is_mod := public.has_role(caller, 'admin'::app_role) OR public.has_role(caller, 'moderator'::app_role);

  IF caller <> b.host_id AND NOT is_mod THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _slow_mode_seconds IS NULL OR _slow_mode_seconds < 0 OR _slow_mode_seconds > 300 THEN
    RAISE EXCEPTION 'invalid_slow_mode';
  END IF;

  -- Clean keyword list: keep string entries, trim, drop empties, cap 32 words
  -- of up to 40 chars each so hosts can't abuse the filter to bloat the row.
  IF _keyword_filters IS NULL OR jsonb_typeof(_keyword_filters) <> 'array' THEN
    cleaned := '[]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(word), '[]'::jsonb)
      INTO cleaned
      FROM (
        SELECT DISTINCT substr(btrim(elem), 1, 40) AS word
          FROM jsonb_array_elements_text(_keyword_filters) AS elem
         WHERE btrim(elem) <> ''
         LIMIT 32
      ) t;
  END IF;

  UPDATE public.live_battles
     SET comments_locked = COALESCE(_comments_locked, comments_locked),
         slow_mode_seconds = _slow_mode_seconds,
         keyword_filters = cleaned
   WHERE id = _battle_id
   RETURNING * INTO b;

  RETURN b;
END;
$$;

REVOKE ALL ON FUNCTION public.set_battle_moderation(uuid, boolean, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_battle_moderation(uuid, boolean, integer, jsonb) TO authenticated, service_role;
