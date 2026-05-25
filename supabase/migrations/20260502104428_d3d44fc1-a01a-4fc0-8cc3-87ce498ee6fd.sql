-- Notify challenger when opponent accepts/declines a battle, and notify both when battle ends with winner
CREATE OR REPLACE FUNCTION public.trg_battle_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loser uuid;
BEGIN
  -- Accept: pending -> active
  IF OLD.status = 'pending' AND NEW.status = 'active' THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      NEW.challenger_id, 'battle_challenge', 'Challenge accepted',
      'Your duel is live — let the votes decide.',
      jsonb_build_object('battle_id', NEW.id, 'opponent_id', NEW.opponent_id, 'event', 'accepted')
    );
    RETURN NEW;
  END IF;

  -- Decline
  IF OLD.status = 'pending' AND NEW.status = 'declined' THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      NEW.challenger_id, 'battle_challenge', 'Challenge declined',
      'Your opponent backed out of the duel.',
      jsonb_build_object('battle_id', NEW.id, 'opponent_id', NEW.opponent_id, 'event', 'declined')
    );
    RETURN NEW;
  END IF;

  -- Completed with a winner: notify both with battle_won / battle_lost
  IF NEW.status = 'completed' AND NEW.winner_id IS NOT NULL
     AND (OLD.status <> 'completed' OR OLD.winner_id IS DISTINCT FROM NEW.winner_id) THEN
    v_loser := CASE WHEN NEW.winner_id = NEW.challenger_id THEN NEW.opponent_id ELSE NEW.challenger_id END;

    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      NEW.winner_id, 'battle_won', 'You won the duel 👑',
      'Your post claimed victory in a Crown Battle.',
      jsonb_build_object('battle_id', NEW.id, 'opponent_id', v_loser, 'event', 'won',
                         'challenger_votes', NEW.challenger_votes, 'opponent_votes', NEW.opponent_votes)
    );

    IF v_loser IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS battles_status_notify_trg ON public.battles;
CREATE TRIGGER battles_status_notify_trg
AFTER UPDATE ON public.battles
FOR EACH ROW
EXECUTE FUNCTION public.trg_battle_status_notify();