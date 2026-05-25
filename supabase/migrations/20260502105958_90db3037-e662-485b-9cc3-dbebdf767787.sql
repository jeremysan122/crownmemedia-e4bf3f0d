-- Extend notification preferences with battle and push toggles
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS battle_invite_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS battle_winner_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false;

-- Update notif_pref helper to support new kinds
CREATE OR REPLACE FUNCTION public.notif_pref(_user_id uuid, _kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT CASE _kind
        WHEN 'reply' THEN reply_alerts
        WHEN 'mention' THEN mention_alerts
        WHEN 'dm' THEN dm_alerts
        WHEN 'battle_invite' THEN battle_invite_alerts
        WHEN 'battle_winner' THEN battle_winner_alerts
        ELSE true
      END
     FROM public.notification_preferences WHERE user_id = _user_id),
    true
  );
$function$;

-- Respect prefs in the battle status notify trigger
CREATE OR REPLACE FUNCTION public.trg_battle_status_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_loser uuid;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'active' THEN
    IF public.notif_pref(NEW.challenger_id, 'battle_invite') THEN
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (
        NEW.challenger_id, 'battle_challenge', 'Challenge accepted',
        'Your duel is live — let the votes decide.',
        jsonb_build_object('battle_id', NEW.id, 'opponent_id', NEW.opponent_id, 'event', 'accepted')
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'declined' THEN
    IF public.notif_pref(NEW.challenger_id, 'battle_invite') THEN
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (
        NEW.challenger_id, 'battle_challenge', 'Challenge declined',
        'Your opponent backed out of the duel.',
        jsonb_build_object('battle_id', NEW.id, 'opponent_id', NEW.opponent_id, 'event', 'declined')
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND NEW.winner_id IS NOT NULL
     AND (OLD.status <> 'completed' OR OLD.winner_id IS DISTINCT FROM NEW.winner_id) THEN
    v_loser := CASE WHEN NEW.winner_id = NEW.challenger_id THEN NEW.opponent_id ELSE NEW.challenger_id END;

    IF public.notif_pref(NEW.winner_id, 'battle_winner') THEN
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (
        NEW.winner_id, 'battle_won', 'You won the duel 👑',
        'Your post claimed victory in a Crown Battle.',
        jsonb_build_object('battle_id', NEW.id, 'opponent_id', v_loser, 'event', 'won',
                           'challenger_votes', NEW.challenger_votes, 'opponent_votes', NEW.opponent_votes)
      );
    END IF;

    IF v_loser IS NOT NULL AND public.notif_pref(v_loser, 'battle_winner') THEN
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (
        v_loser, 'battle_lost', 'Battle ended',
        'You fought well — the crown went to your opponent this time.',
        jsonb_build_object('battle_id', NEW.id, 'winner_id', NEW.winner_id, 'event', 'lost',
                           'challenger_votes', NEW.challenger_votes, 'opponent_votes', NEW.opponent_votes)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;