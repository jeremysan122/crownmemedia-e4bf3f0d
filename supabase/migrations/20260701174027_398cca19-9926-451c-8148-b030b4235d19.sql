
ALTER TABLE public.battles
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

UPDATE public.battles
   SET duration_seconds = GREATEST(
     900,
     LEAST(
       259200,
       COALESCE(EXTRACT(EPOCH FROM (ends_at - created_at))::int, 86400)
     )
   )
 WHERE duration_seconds IS NULL;

UPDATE public.battles SET ends_at = NULL
 WHERE status = 'pending' AND ends_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.battles_validate_duration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.duration_seconds IS NOT NULL
     AND (NEW.duration_seconds < 900 OR NEW.duration_seconds > 259200) THEN
    RAISE EXCEPTION 'invalid battle duration' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_battles_validate_duration ON public.battles;
CREATE TRIGGER trg_battles_validate_duration
  BEFORE INSERT OR UPDATE OF duration_seconds ON public.battles
  FOR EACH ROW EXECUTE FUNCTION public.battles_validate_duration();

CREATE OR REPLACE FUNCTION public.is_battle_eligible_post(_post_id uuid, _owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = _post_id
      AND p.user_id = _owner_id
      AND COALESCE(p.is_removed, false)  = false
      AND COALESCE(p.is_archived, false) = false
      AND (p.parent_post_id IS NULL)
      AND (p.content_type IS NULL OR p.content_type = 'post')
      AND (p.moderation_status IS NULL OR p.moderation_status NOT IN ('removed','flagged'))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_challengeable_user(_viewer uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _viewer IS NOT NULL AND _target IS NOT NULL AND _viewer <> _target
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = _target
        AND COALESCE(pr.is_banned, false) = false
        AND COALESCE(pr.is_suspended, false) = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = _viewer AND blocked_id = _target)
         OR (blocker_id = _target AND blocked_id = _viewer)
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_battle_eligible_post(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_challengeable_user(uuid, uuid)   TO authenticated;

CREATE OR REPLACE FUNCTION public.create_battle_challenge(
  _opponent_id uuid, _challenger_post_id uuid, _duration_seconds integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _new_id uuid; _dur int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE='42501'; END IF;
  _dur := COALESCE(_duration_seconds, 86400);
  IF _dur < 900 OR _dur > 259200 THEN RAISE EXCEPTION 'invalid duration' USING ERRCODE='22023'; END IF;
  IF NOT public.is_challengeable_user(_uid, _opponent_id) THEN
    RAISE EXCEPTION 'opponent not challengeable' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_battle_eligible_post(_challenger_post_id, _uid) THEN
    RAISE EXCEPTION 'post not battle-eligible' USING ERRCODE='42501';
  END IF;
  IF (SELECT COUNT(*) FROM public.battles
      WHERE status='pending'
        AND ((challenger_id=_uid AND opponent_id=_opponent_id)
          OR (challenger_id=_opponent_id AND opponent_id=_uid))) >= 5 THEN
    RAISE EXCEPTION 'too many pending challenges' USING ERRCODE='53400';
  END IF;
  INSERT INTO public.battles (challenger_id, opponent_id, challenger_post_id, status, duration_seconds, ends_at)
    VALUES (_uid, _opponent_id, _challenger_post_id, 'pending', _dur, NULL)
    RETURNING id INTO _new_id;
  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_battle_challenge(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_battle(_battle_id uuid, _opponent_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _b public.battles%ROWTYPE; _dur int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE='42501'; END IF;
  SELECT * INTO _b FROM public.battles WHERE id=_battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle not found' USING ERRCODE='P0002'; END IF;
  IF _b.opponent_id <> _uid THEN RAISE EXCEPTION 'only opponent can accept' USING ERRCODE='42501'; END IF;
  IF _b.status <> 'pending' THEN RAISE EXCEPTION 'battle not pending' USING ERRCODE='22023'; END IF;
  IF NOT public.is_challengeable_user(_uid, _b.challenger_id) THEN
    RAISE EXCEPTION 'challenger no longer challengeable' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_battle_eligible_post(_opponent_post_id, _uid) THEN
    RAISE EXCEPTION 'post not battle-eligible' USING ERRCODE='42501';
  END IF;
  _dur := COALESCE(_b.duration_seconds, 86400);
  UPDATE public.battles
     SET status='active', opponent_post_id=_opponent_post_id,
         accepted_at=now(), ends_at=now() + make_interval(secs => _dur)
   WHERE id=_battle_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_battle(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_battle(_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _b public.battles%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE='42501'; END IF;
  SELECT * INTO _b FROM public.battles WHERE id=_battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle not found' USING ERRCODE='P0002'; END IF;
  IF _b.opponent_id <> _uid AND _b.challenger_id <> _uid THEN
    RAISE EXCEPTION 'only participants can decline' USING ERRCODE='42501';
  END IF;
  IF _b.status <> 'pending' THEN RAISE EXCEPTION 'battle not pending' USING ERRCODE='22023'; END IF;
  UPDATE public.battles SET status='declined', ends_at=COALESCE(ends_at, now()) WHERE id=_battle_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_battle(uuid) TO authenticated;
