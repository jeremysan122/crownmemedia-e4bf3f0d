
-- Fix 1: get_user_crown_metrics used wrong columns on follows / live_battle_viewers
CREATE OR REPLACE FUNCTION public.get_user_crown_metrics(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_account_age_days INT := 0;
  v_battle_wins INT := 0;
  v_crown_balance BIGINT := 0;
  v_followers INT := 0;
  v_posts_count INT := 0;
  v_streak INT := 0;
  v_gifts_sent INT := 0;
  v_battles_watched INT := 0;
  v_tournament_wins INT := 0;
  v_legend_score INT := 0;
BEGIN
  SELECT COALESCE(EXTRACT(DAY FROM (now() - created_at))::int, 0)
    INTO v_account_age_days FROM public.profiles WHERE id = _user_id;

  BEGIN SELECT COUNT(*)::int INTO v_battle_wins FROM public.battles WHERE winner_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_battle_wins := 0; END;

  BEGIN SELECT COALESCE(SUM(amount), 0)::bigint INTO v_crown_balance FROM public.shekel_ledger WHERE user_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_crown_balance := 0; END;

  -- FIX: follows uses following_id (target), not followed_id
  BEGIN SELECT COUNT(*)::int INTO v_followers FROM public.follows WHERE following_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_followers := 0; END;

  BEGIN SELECT COUNT(*)::int INTO v_posts_count FROM public.posts WHERE user_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_posts_count := 0; END;

  BEGIN SELECT COALESCE(MAX(current_streak), 0)::int INTO v_streak FROM public.daily_streaks WHERE user_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_streak := 0; END;

  BEGIN SELECT COUNT(*)::int INTO v_gifts_sent FROM public.gift_transactions WHERE sender_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_gifts_sent := 0; END;

  -- FIX: live_battle_viewers uses viewer_id, not user_id
  BEGIN SELECT COUNT(DISTINCT battle_id)::int INTO v_battles_watched FROM public.live_battle_viewers WHERE viewer_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_battles_watched := 0; END;

  BEGIN SELECT COUNT(*)::int INTO v_tournament_wins FROM public.tournament_matches WHERE winner_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_tournament_wins := 0; END;

  SELECT COUNT(DISTINCT ac.collection_slug)::int INTO v_legend_score
    FROM public.user_achievement_crowns uac
    JOIN public.achievement_crowns ac ON ac.id = uac.crown_id
   WHERE uac.user_id = _user_id AND ac.tier_index >= 9 AND ac.collection_slug <> 'legend';

  RETURN jsonb_build_object(
    'account_age_days', v_account_age_days,
    'battle_wins', v_battle_wins,
    'crown_balance', v_crown_balance,
    'followers', v_followers,
    'posts_count', v_posts_count,
    'daily_streak_days', v_streak,
    'gifts_sent', v_gifts_sent,
    'battles_watched', v_battles_watched,
    'tournament_wins', v_tournament_wins,
    'legend_score', v_legend_score
  );
END;
$$;

-- Fix 2: evaluate_user_crowns now emits a notification per newly unlocked crown.
CREATE OR REPLACE FUNCTION public.evaluate_user_crowns(_user_id uuid)
RETURNS TABLE(newly_unlocked_crown_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  metrics JSONB;
  crown RECORD;
  progress_val NUMERIC;
  target_val NUMERIC;
  is_met BOOLEAN;
  unlocked UUID[] := ARRAY[]::UUID[];
  owned_count NUMERIC;
  did_insert BOOLEAN;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  metrics := public.get_user_crown_metrics(_user_id);

  FOR crown IN
    SELECT ac.id, ac.slug, ac.name, ac.rarity, ac.gallery_asset_url, ac.thumbnail_url, ac.collection_name, ac.requirement_logic
    FROM public.achievement_crowns ac
    WHERE ac.is_active = true
  LOOP
    progress_val := 0; target_val := 1; is_met := false;

    IF (crown.requirement_logic->>'type') = 'metric' THEN
      target_val := COALESCE((crown.requirement_logic->>'threshold')::numeric, 1);
      progress_val := COALESCE((metrics->>(crown.requirement_logic->>'metric'))::numeric, 0);
      is_met := progress_val >= target_val;
    ELSIF (crown.requirement_logic->>'type') = 'composite_all_crowns' THEN
      target_val := COALESCE((crown.requirement_logic->>'required_count')::numeric, 99);
      SELECT COUNT(*)::numeric INTO owned_count
        FROM public.user_achievement_crowns uac
        JOIN public.achievement_crowns ac2 ON ac2.id = uac.crown_id
       WHERE uac.user_id = _user_id AND ac2.slug <> crown.slug;
      progress_val := owned_count;
      is_met := progress_val >= target_val;
    END IF;

    INSERT INTO public.user_crown_progress(user_id, crown_id, progress, target, completion_percent, last_evaluated_at)
    VALUES (_user_id, crown.id, progress_val, target_val,
            LEAST(100, ROUND((progress_val / NULLIF(target_val,0)) * 100, 2)), now())
    ON CONFLICT (user_id, crown_id) DO UPDATE
      SET progress = EXCLUDED.progress, target = EXCLUDED.target,
          completion_percent = EXCLUDED.completion_percent,
          last_evaluated_at = now(), updated_at = now();

    IF is_met THEN
      did_insert := false;
      WITH ins AS (
        INSERT INTO public.user_achievement_crowns(user_id, crown_id, unlocked_at, source)
        VALUES (_user_id, crown.id, now(), 'evaluator')
        ON CONFLICT (user_id, crown_id) DO NOTHING
        RETURNING crown_id
      )
      SELECT true INTO did_insert FROM ins;

      IF did_insert THEN
        unlocked := array_append(unlocked, crown.id);
        -- Emit a personal notification (drives toast + celebration modal)
        INSERT INTO public.notifications(user_id, type, title, body, payload, read)
        VALUES (
          _user_id,
          'crown_unlocked',
          'New Achievement Crown unlocked',
          crown.name || ' · ' || crown.collection_name,
          jsonb_build_object(
            'kind', 'crown_unlocked',
            'crown_id', crown.id,
            'slug', crown.slug,
            'name', crown.name,
            'rarity', crown.rarity,
            'collection_name', crown.collection_name,
            'gallery_asset_url', crown.gallery_asset_url,
            'thumbnail_url', crown.thumbnail_url
          ),
          false
        );
      END IF;
    END IF;
  END LOOP;

  newly_unlocked_crown_ids := unlocked;
  RETURN NEXT;
END;
$$;

-- Reconciliation entrypoint: evaluates crowns for every profile updated in the last 24h.
-- Called by pg_cron every 5 minutes. Safe to run repeatedly (idempotent).
CREATE OR REPLACE FUNCTION public.reconcile_crown_unlocks_recent()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  u RECORD;
  n INT := 0;
BEGIN
  FOR u IN
    SELECT id FROM public.profiles
    WHERE updated_at > now() - interval '24 hours'
      AND COALESCE(is_banned, false) = false
    LIMIT 2000
  LOOP
    BEGIN
      PERFORM public.evaluate_user_crowns(u.id);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- log and continue
      INSERT INTO public.cron_error_log(job_name, error_message, context)
      VALUES ('reconcile_crown_unlocks_recent', SQLERRM, jsonb_build_object('user_id', u.id))
      ON CONFLICT DO NOTHING;
    END;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_crown_unlocks_recent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_crown_unlocks_recent() TO service_role;
