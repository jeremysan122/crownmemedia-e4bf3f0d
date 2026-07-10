
CREATE OR REPLACE FUNCTION public.create_rematch(_battle_id UUID)
RETURNS public.live_battles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  flag_on BOOLEAN;
  src public.live_battles;
  room TEXT;
  new_row public.live_battles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT public.is_feature_enabled('live_battles_enabled') INTO flag_on;
  IF NOT COALESCE(flag_on, false) THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  SELECT * INTO src FROM public.live_battles WHERE id = _battle_id;
  IF src.id IS NULL THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF src.status <> 'ended' THEN RAISE EXCEPTION 'battle_not_ended'; END IF;
  IF uid <> src.host_id AND uid <> src.opponent_id THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  PERFORM public.enforce_rate_limit('livebattle:create', 5, 3600);

  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = src.host_id AND blocked_id = src.opponent_id)
       OR (blocker_id = src.opponent_id AND blocked_id = src.host_id)
  ) THEN RAISE EXCEPTION 'blocked'; END IF;

  room := 'lb_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.live_battles(
    host_id, opponent_id, room_name, duration_seconds, category_slug, region
  ) VALUES (
    uid,
    CASE WHEN uid = src.host_id THEN src.opponent_id ELSE src.host_id END,
    room, src.duration_seconds, src.category_slug, src.region
  ) RETURNING * INTO new_row;

  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'live_battle_rematch', 'monitoring', 'info',
          jsonb_build_object('event','rematch_created','battle_id',new_row.id,'from_battle_id',src.id));

  RETURN new_row;
END; $$;

REVOKE ALL ON FUNCTION public.create_rematch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rematch(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size IN (4, 8, 16)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category_slug TEXT,
  region TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 300 CHECK (duration_seconds BETWEEN 60 AND 3600),
  current_round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON public.tournaments(created_by);

GRANT SELECT ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_select_authenticated"
  ON public.tournaments FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL CHECK (round >= 1),
  slot INTEGER NOT NULL CHECK (slot >= 0),
  host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opponent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  battle_id UUID REFERENCES public.live_battles(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  next_slot SMALLINT CHECK (next_slot IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','live','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, slot)
);
CREATE INDEX IF NOT EXISTS idx_tm_tournament ON public.tournament_matches(tournament_id, round, slot);
CREATE INDEX IF NOT EXISTS idx_tm_battle ON public.tournament_matches(battle_id) WHERE battle_id IS NOT NULL;

GRANT SELECT ON public.tournament_matches TO authenticated;
GRANT ALL ON public.tournament_matches TO service_role;

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_matches_select_authenticated"
  ON public.tournament_matches FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.create_tournament(
  _title TEXT,
  _size INTEGER,
  _participants UUID[],
  _category_slug TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _duration_seconds INTEGER DEFAULT 300
)
RETURNS public.tournaments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  flag_on BOOLEAN;
  t public.tournaments;
  dur INTEGER;
  cat TEXT;
  reg TEXT;
  total_rounds INTEGER;
  r INTEGER;
  matches_in_round INTEGER;
  slot_i INTEGER;
  m_id UUID;
  parent_id UUID;
  parent_slot SMALLINT;
  round1_ids UUID[];
  round_ids UUID[];
  prev_round_ids UUID[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _size NOT IN (4, 8, 16) THEN RAISE EXCEPTION 'invalid_size'; END IF;
  IF array_length(_participants, 1) <> _size THEN RAISE EXCEPTION 'invalid_participants'; END IF;
  IF _title IS NULL OR length(trim(_title)) < 3 THEN RAISE EXCEPTION 'invalid_title'; END IF;

  SELECT public.is_feature_enabled('live_battles_enabled') INTO flag_on;
  IF NOT COALESCE(flag_on, false) THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  PERFORM public.enforce_rate_limit('tournament:create', 3, 3600);

  IF (SELECT COUNT(DISTINCT x) FROM unnest(_participants) x) <> _size THEN
    RAISE EXCEPTION 'duplicate_participants';
  END IF;

  dur := GREATEST(60, LEAST(3600, COALESCE(_duration_seconds, 300)));

  IF _category_slug IS NOT NULL AND length(trim(_category_slug)) > 0 THEN
    SELECT slug INTO cat FROM public.main_categories WHERE slug = _category_slug AND is_active = true;
    IF cat IS NULL THEN RAISE EXCEPTION 'invalid_category'; END IF;
  END IF;
  IF _region IS NOT NULL AND length(trim(_region)) > 0 THEN
    reg := substring(trim(_region) FROM 1 FOR 80);
  END IF;

  INSERT INTO public.tournaments(title, size, created_by, category_slug, region, duration_seconds)
  VALUES (trim(_title), _size, uid, cat, reg, dur)
  RETURNING * INTO t;

  total_rounds := CASE _size WHEN 4 THEN 2 WHEN 8 THEN 3 WHEN 16 THEN 4 END;

  prev_round_ids := ARRAY[]::UUID[];
  FOR r IN 1..total_rounds LOOP
    matches_in_round := _size / (2 ^ r)::INTEGER;
    round_ids := ARRAY[]::UUID[];
    FOR slot_i IN 0..(matches_in_round - 1) LOOP
      INSERT INTO public.tournament_matches(tournament_id, round, slot)
      VALUES (t.id, r, slot_i)
      RETURNING id INTO m_id;
      round_ids := round_ids || m_id;
    END LOOP;

    IF r > 1 THEN
      FOR slot_i IN 0..(array_length(prev_round_ids, 1) - 1) LOOP
        parent_id := round_ids[(slot_i / 2) + 1];
        parent_slot := (slot_i % 2)::SMALLINT;
        UPDATE public.tournament_matches
           SET next_match_id = parent_id, next_slot = parent_slot
         WHERE id = prev_round_ids[slot_i + 1];
      END LOOP;
    END IF;

    IF r = 1 THEN round1_ids := round_ids; END IF;
    prev_round_ids := round_ids;
  END LOOP;

  FOR slot_i IN 0..(array_length(round1_ids, 1) - 1) LOOP
    UPDATE public.tournament_matches
       SET host_id = _participants[slot_i * 2 + 1],
           opponent_id = _participants[slot_i * 2 + 2],
           status = 'ready'
     WHERE id = round1_ids[slot_i + 1];
  END LOOP;

  RETURN t;
END; $$;

REVOKE ALL ON FUNCTION public.create_tournament(TEXT, INTEGER, UUID[], TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tournament(TEXT, INTEGER, UUID[], TEXT, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_tournament_match(_match_id UUID)
RETURNS public.live_battles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  m public.tournament_matches;
  t public.tournaments;
  room TEXT;
  new_battle public.live_battles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO m FROM public.tournament_matches WHERE id = _match_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ready' THEN RAISE EXCEPTION 'match_not_ready'; END IF;
  IF m.battle_id IS NOT NULL THEN RAISE EXCEPTION 'match_already_started'; END IF;
  IF m.host_id IS NULL OR m.opponent_id IS NULL THEN RAISE EXCEPTION 'match_missing_participants'; END IF;

  SELECT * INTO t FROM public.tournaments WHERE id = m.tournament_id;
  IF uid <> t.created_by AND uid <> m.host_id AND uid <> m.opponent_id
     AND NOT (public.has_role(uid,'admin') OR public.has_role(uid,'moderator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  room := 'tm_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.live_battles(
    host_id, opponent_id, room_name, duration_seconds, category_slug, region
  ) VALUES (
    m.host_id, m.opponent_id, room, t.duration_seconds, t.category_slug, t.region
  ) RETURNING * INTO new_battle;

  UPDATE public.tournament_matches
     SET battle_id = new_battle.id, status = 'live'
   WHERE id = m.id;

  RETURN new_battle;
END; $$;

REVOKE ALL ON FUNCTION public.start_tournament_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_tournament_match(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_tournament_advance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.tournament_matches;
  advanced UUID;
  remaining INTEGER;
BEGIN
  IF NEW.status <> 'ended' OR COALESCE(OLD.status, '') = 'ended' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO m FROM public.tournament_matches WHERE battle_id = NEW.id;
  IF m.id IS NULL THEN RETURN NEW; END IF;

  advanced := COALESCE(NEW.winner_id, m.host_id);

  UPDATE public.tournament_matches
     SET winner_id = advanced, status = 'completed'
   WHERE id = m.id;

  IF m.next_match_id IS NOT NULL THEN
    IF m.next_slot = 0 THEN
      UPDATE public.tournament_matches
         SET host_id = advanced,
             status = CASE WHEN opponent_id IS NOT NULL THEN 'ready' ELSE 'pending' END
       WHERE id = m.next_match_id;
    ELSE
      UPDATE public.tournament_matches
         SET opponent_id = advanced,
             status = CASE WHEN host_id IS NOT NULL THEN 'ready' ELSE 'pending' END
       WHERE id = m.next_match_id;
    END IF;
  ELSE
    UPDATE public.tournaments
       SET status = 'completed', winner_id = advanced, completed_at = now()
     WHERE id = m.tournament_id;
  END IF;

  SELECT COUNT(*) INTO remaining
  FROM public.tournament_matches
  WHERE tournament_id = m.tournament_id AND status <> 'completed';
  IF remaining > 0 THEN
    UPDATE public.tournaments t2
       SET current_round = (
         SELECT MIN(round) FROM public.tournament_matches
         WHERE tournament_id = m.tournament_id AND status <> 'completed'
       )
     WHERE t2.id = m.tournament_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tournament_advance ON public.live_battles;
CREATE TRIGGER trg_tournament_advance
AFTER UPDATE OF status ON public.live_battles
FOR EACH ROW EXECUTE FUNCTION public.tg_tournament_advance();
