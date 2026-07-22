-- =========================================================================
-- Bug-fix pass:
--   1. posts_notify_tagged: never let a notification failure block publish.
--   2. Live battles: accepting an invite no longer starts the battle. It
--      records acceptance and routes both players to the pre-battle lobby;
--      the battle only goes live via start_battle_from_lobby once BOTH are
--      ready and the host presses start.
--   3. Follower/following counters: the profiles guard trigger was silently
--      reverting the counter updates made by trg_follow_counts (and the vote
--      counters from trg_recalc_from_votes) because those run inside an
--      authenticated request, not a service_role context. Allow updates that
--      originate from nested triggers, and backfill the drifted counters.
-- =========================================================================

-- ---------- 1. Tag notifications must never block publishing -------------

CREATE OR REPLACE FUNCTION public.posts_notify_tagged()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_username text;
  v_added uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_added := COALESCE(NEW.tagged_user_ids, '{}'::uuid[]);
  ELSE
    v_added := ARRAY(
      SELECT u FROM unnest(COALESCE(NEW.tagged_user_ids, '{}'::uuid[])) AS u
      WHERE u <> ALL (COALESCE(OLD.tagged_user_ids, '{}'::uuid[]))
    );
  END IF;

  IF array_length(v_added, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = NEW.user_id;

  FOREACH v_uid IN ARRAY v_added LOOP
    IF v_uid IS NULL OR v_uid = NEW.user_id THEN CONTINUE; END IF;
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (
        v_uid,
        'mention'::notification_type,
        'You were tagged',
        COALESCE('@' || v_username, 'Someone') || ' tagged you in a post',
        jsonb_build_object('post_id', NEW.id, 'actor_id', NEW.user_id)
      );
    EXCEPTION WHEN OTHERS THEN
      -- A broken notification must never abort the post publish itself.
      RAISE WARNING 'posts_notify_tagged: notify % failed: %', v_uid, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ---------- 2. Accepting a live-battle invite opens the lobby ------------

ALTER TABLE public.live_battles
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.live_battle_accept(_battle_id uuid)
RETURNS live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b public.live_battles%ROWTYPE; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF b.opponent_id <> uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF b.status <> 'pending' THEN RAISE EXCEPTION 'battle_not_pending'; END IF;

  -- Idempotent: a second accept just returns the row.
  IF b.accepted_at IS NOT NULL THEN RETURN b; END IF;

  -- The battle does NOT go live here. Both players meet in the pre-battle
  -- lobby, ready up, and the host starts it (start_battle_from_lobby
  -- enforces host_ready AND opponent_ready).
  UPDATE public.live_battles
     SET accepted_at = now(),
         lobby_opened_at = COALESCE(lobby_opened_at, now())
   WHERE id = _battle_id
   RETURNING * INTO b;

  PERFORM public._notify_live_battle(
    b.host_id, 'live_battle_accepted',
    'Challenge accepted',
    'Your opponent accepted. Meet them in the lobby and ready up to go live.',
    b.id,
    jsonb_build_object('link', '/battles/' || b.id::text || '/lobby')
  );
  PERFORM public._notify_live_battle(
    b.opponent_id, 'live_battle_accepted',
    'You accepted the challenge',
    'Head to the lobby and ready up. The battle starts when both of you are ready.',
    b.id,
    jsonb_build_object('link', '/battles/' || b.id::text || '/lobby')
  );

  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'live_battle_accepted', 'monitoring', 'info',
          jsonb_build_object('event','live_battle_accepted','battle_id', b.id));
  RETURN b;
END;
$$;

REVOKE ALL ON FUNCTION public.live_battle_accept(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_accept(uuid) TO authenticated, service_role;

-- Starting from the lobby additionally requires the invite to have been
-- accepted (scheduled battles carry implicit acceptance).
CREATE OR REPLACE FUNCTION public.start_battle_from_lobby(
  _battle_id uuid
) RETURNS public.live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _battle public.live_battles;
  _now timestamptz := now();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _battle FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF _uid <> _battle.host_id THEN RAISE EXCEPTION 'only_host'; END IF;
  IF _battle.status NOT IN ('pending', 'scheduled') THEN
    RAISE EXCEPTION 'battle_not_in_lobby';
  END IF;
  IF _battle.status = 'pending' AND _battle.accepted_at IS NULL THEN
    RAISE EXCEPTION 'battle_not_accepted';
  END IF;
  IF NOT (_battle.host_ready AND _battle.opponent_ready) THEN
    RAISE EXCEPTION 'both_must_be_ready';
  END IF;

  UPDATE public.live_battles
    SET status = 'live',
        started_at = _now,
        ends_at = _now + make_interval(secs => duration_seconds),
        go_live_at = _now
    WHERE id = _battle_id
    RETURNING * INTO _battle;

  RETURN _battle;
END;
$$;

REVOKE ALL ON FUNCTION public.start_battle_from_lobby(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_battle_from_lobby(uuid) TO authenticated;

-- Invite notifications name the challenger so receivers know who it's from.
CREATE OR REPLACE FUNCTION public.trg_live_battles_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_host_username text;
BEGIN
  -- Invite: pending row created.
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT username INTO v_host_username FROM public.profiles WHERE id = NEW.host_id;
    PERFORM public._notify_live_battle(
      NEW.opponent_id, 'live_battle_invite',
      COALESCE('@' || v_host_username, 'Someone') || ' challenged you to a live battle',
      'Tap to accept or decline the invite.', NEW.id,
      jsonb_build_object('challenger_id', NEW.host_id, 'challenger_username', v_host_username)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Ended: notify both with outcome. Skip if RPC already sent one (accept/decline/cancel handled separately).
    IF OLD.status <> 'ended' AND NEW.status = 'ended' THEN
      IF NEW.winner_id IS NULL THEN
        PERFORM public._notify_live_battle(NEW.host_id, 'live_battle_ended',
          'Live battle ended in a tie', 'Great match — no crown moved.', NEW.id,
          jsonb_build_object('outcome','tie'));
        PERFORM public._notify_live_battle(NEW.opponent_id, 'live_battle_ended',
          'Live battle ended in a tie', 'Great match — no crown moved.', NEW.id,
          jsonb_build_object('outcome','tie'));
      ELSE
        PERFORM public._notify_live_battle(NEW.winner_id, 'live_battle_ended',
          'You won your live battle', 'The audience picked you. 👑', NEW.id,
          jsonb_build_object('outcome','win'));
        PERFORM public._notify_live_battle(
          CASE WHEN NEW.winner_id = NEW.host_id THEN NEW.opponent_id ELSE NEW.host_id END,
          'live_battle_ended', 'You lost your live battle',
          'So close — get them next time.', NEW.id,
          jsonb_build_object('outcome','loss'));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- 3. Profile counters: trust nested trigger updates ------------

CREATE OR REPLACE FUNCTION public.profiles_guard_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  service_role_context boolean;
  jwt_claims_text text;
  jwt_role text;
  role_guc text;
BEGIN
  -- Updates issued from inside another trigger (follows / votes / crowns
  -- counter maintenance) are server-owned by definition — clients cannot
  -- reach this code path directly. Without this, trg_follow_counts and
  -- trg_recalc_from_votes had their counter bumps silently reverted, which
  -- is why followers_count drifted from the real follower list.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Read JSON claims safely.
  jwt_claims_text := current_setting('request.jwt.claims', true);
  IF jwt_claims_text IS NOT NULL AND jwt_claims_text <> '' THEN
    BEGIN
      jwt_role := (jwt_claims_text::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      jwt_role := NULL; -- malformed claims → untrusted
    END;
  END IF;

  role_guc := current_setting('role', true);

  -- Matched trusted context: BOTH the DB role GUC AND a JWT-carried role
  -- claim must say service_role. Neither signal alone is sufficient.
  service_role_context := (
    role_guc = 'service_role'
    AND (
      jwt_role = 'service_role'
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
    )
  );

  is_privileged := (
    service_role_context
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

  IF is_privileged THEN RETURN NEW; END IF;

  -- Existing protected fields
  NEW.is_suspended          := OLD.is_suspended;
  NEW.crowns_held           := OLD.crowns_held;
  NEW.crowns_total          := OLD.crowns_total;
  NEW.battle_wins           := OLD.battle_wins;
  NEW.followers_count       := OLD.followers_count;
  NEW.following_count       := OLD.following_count;
  NEW.votes_received        := OLD.votes_received;
  NEW.votes_given           := OLD.votes_given;
  NEW.is_banned             := OLD.is_banned;
  NEW.banned_at             := OLD.banned_at;
  NEW.banned_by             := OLD.banned_by;
  NEW.banned_reason         := OLD.banned_reason;
  NEW.deactivated_at        := OLD.deactivated_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.verified              := OLD.verified;
  NEW.verified_at           := OLD.verified_at;
  NEW.verification_plan     := OLD.verification_plan;

  -- Royal Pass protected fields (Wave 8.1)
  NEW.boost_tokens_balance := OLD.boost_tokens_balance;
  NEW.is_founder           := OLD.is_founder;
  NEW.founder_granted_at   := OLD.founder_granted_at;
  NEW.founder_title        := OLD.founder_title;
  NEW.royal_frame_variant  := OLD.royal_frame_variant;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.profiles_guard_protected_fields() IS
'Reverts server-owned profile fields on UPDATE unless (a) the update originates from a nested trigger (pg_trigger_depth() > 1 — internal counter maintenance), (b) the caller is in a matched service_role context — DB role GUC = service_role AND JWT claims role = service_role — or (c) auth.uid() is admin/moderator. Neither the DB role alone (raw psql/postgres) nor a JWT claim alone is sufficient.';

-- Backfill counters that drifted while the guard was reverting the triggers.
-- The guard trigger is briefly disabled so this direct migration UPDATE
-- (which runs at trigger depth 0→1, an untrusted context by design) can land.
ALTER TABLE public.profiles DISABLE TRIGGER trg_profiles_guard_protected_fields;

UPDATE public.profiles p
SET followers_count = (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id),
    following_count = (SELECT count(*) FROM public.follows f WHERE f.follower_id = p.id),
    votes_received  = (SELECT count(*) FROM public.votes v JOIN public.posts po ON po.id = v.post_id WHERE po.user_id = p.id),
    votes_given     = (SELECT count(*) FROM public.votes v WHERE v.user_id = p.id);

ALTER TABLE public.profiles ENABLE TRIGGER trg_profiles_guard_protected_fields;
