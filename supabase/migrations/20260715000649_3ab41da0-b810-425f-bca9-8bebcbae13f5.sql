
DELETE FROM public.achievement_crowns WHERE slug LIKE 'crown-%';

DO $seed$
DECLARE
  collections JSONB := '[
    {"slug":"origin","name":"Origin","metric":"account_age_days","thresholds":[0,1,3,7,14,30,60,90,180,365],"hint_prefix":"Days since joining CrownMe"},
    {"slug":"battler","name":"Battle Champion","metric":"battle_wins","thresholds":[1,5,10,25,50,100,250,500,1000,2500],"hint_prefix":"Battle wins"},
    {"slug":"crown_hoarder","name":"Crown Hoarder","metric":"crown_balance","thresholds":[100,500,1000,5000,10000,25000,50000,100000,250000,1000000],"hint_prefix":"Crowns earned"},
    {"slug":"social","name":"Social Sovereign","metric":"followers","thresholds":[1,10,50,100,500,1000,5000,10000,50000,100000],"hint_prefix":"Followers"},
    {"slug":"creator","name":"Content Crown","metric":"posts_count","thresholds":[1,5,10,25,50,100,250,500,1000,5000],"hint_prefix":"Posts published"},
    {"slug":"streak","name":"Streak Sovereign","metric":"daily_streak_days","thresholds":[1,3,7,14,30,60,100,180,365,730],"hint_prefix":"Daily streak"},
    {"slug":"gifter","name":"Gilded Patron","metric":"gifts_sent","thresholds":[1,5,10,25,100,250,500,1000,5000,10000],"hint_prefix":"Gifts sent"},
    {"slug":"spectator","name":"Arena Sage","metric":"battles_watched","thresholds":[1,10,25,50,100,250,500,1000,5000,10000],"hint_prefix":"Battles watched"},
    {"slug":"tournament","name":"Tournament Titan","metric":"tournament_wins","thresholds":[1,2,5,10,25,50,100,200,500,1000],"hint_prefix":"Tournament wins"},
    {"slug":"legend","name":"Legendary","metric":"legend_score","thresholds":[1,2,3,4,5,6,7,8,9,99],"hint_prefix":"Collections mastered"}
  ]'::jsonb;
  col JSONB;
  i INT;
  crown_idx INT := 0;
  rarity_val TEXT;
  tier INT;
  threshold NUMERIC;
  req JSONB;
  name_suffixes TEXT[] := ARRAY['Spark','Ember','Flame','Blaze','Ascendant','Radiant','Sovereign','Regent','Imperial','Eternal'];
BEGIN
  FOR col IN SELECT * FROM jsonb_array_elements(collections) LOOP
    FOR i IN 1..10 LOOP
      crown_idx := crown_idx + 1;
      tier := i;
      threshold := (col->'thresholds'->>(i-1))::numeric;
      rarity_val := CASE
        WHEN i <= 2 THEN 'common'
        WHEN i <= 4 THEN 'uncommon'
        WHEN i <= 6 THEN 'rare'
        WHEN i <= 8 THEN 'epic'
        WHEN i = 9 THEN 'legendary'
        ELSE 'mythic'
      END;
      IF crown_idx = 100 THEN
        req := jsonb_build_object('type','composite_all_crowns','required_count',99);
      ELSE
        req := jsonb_build_object('type','metric','metric',col->>'metric','threshold',threshold);
      END IF;

      INSERT INTO public.achievement_crowns(
        slug, name, collection_slug, collection_name, rarity, tier_index,
        asset_url, description, lore, unlock_hint, requirement_logic,
        is_secret, is_active, sort_order
      ) VALUES (
        'crown-' || lpad(crown_idx::text, 3, '0'),
        (col->>'name') || ' ' || name_suffixes[i],
        col->>'slug',
        col->>'name',
        rarity_val,
        tier,
        '/achievement-crowns/crown-' || lpad(crown_idx::text, 3, '0') || '.webp',
        (col->>'name') || ' — Tier ' || tier || ' (' || rarity_val || ')',
        'A crown forged for those who walk the path of the ' || (col->>'name') || '.',
        CASE WHEN crown_idx = 100
             THEN 'Unlock all 99 other crowns'
             ELSE (col->>'hint_prefix') || ' ≥ ' || threshold::bigint::text
        END,
        req, false, true, crown_idx
      );
    END LOOP;
  END LOOP;
END
$seed$;

CREATE UNIQUE INDEX IF NOT EXISTS user_crown_progress_user_crown_uidx
  ON public.user_crown_progress(user_id, crown_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_achievement_crowns_user_crown_uidx
  ON public.user_achievement_crowns(user_id, crown_id);

CREATE OR REPLACE FUNCTION public.get_user_crown_metrics(_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  BEGIN SELECT COUNT(*)::int INTO v_followers FROM public.follows WHERE followed_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_followers := 0; END;

  BEGIN SELECT COUNT(*)::int INTO v_posts_count FROM public.posts WHERE user_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_posts_count := 0; END;

  BEGIN SELECT COALESCE(MAX(current_streak), 0)::int INTO v_streak FROM public.daily_streaks WHERE user_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_streak := 0; END;

  BEGIN SELECT COUNT(*)::int INTO v_gifts_sent FROM public.gift_transactions WHERE sender_id = _user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_gifts_sent := 0; END;

  BEGIN SELECT COUNT(DISTINCT battle_id)::int INTO v_battles_watched FROM public.live_battle_viewers WHERE user_id = _user_id;
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

REVOKE EXECUTE ON FUNCTION public.get_user_crown_metrics(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_crown_metrics(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.evaluate_user_crowns(_user_id UUID)
RETURNS TABLE(newly_unlocked_crown_ids UUID[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  metrics JSONB;
  crown RECORD;
  progress_val NUMERIC;
  target_val NUMERIC;
  is_met BOOLEAN;
  unlocked UUID[] := ARRAY[]::UUID[];
  owned_count NUMERIC;
  inserted_row RECORD;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  metrics := public.get_user_crown_metrics(_user_id);

  FOR crown IN SELECT ac.id, ac.slug, ac.requirement_logic FROM public.achievement_crowns ac WHERE ac.is_active = true
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
      WITH ins AS (
        INSERT INTO public.user_achievement_crowns(user_id, crown_id, unlocked_at)
        VALUES (_user_id, crown.id, now())
        ON CONFLICT (user_id, crown_id) DO NOTHING
        RETURNING crown_id
      )
      SELECT crown_id INTO inserted_row FROM ins;
      IF inserted_row.crown_id IS NOT NULL THEN
        unlocked := array_append(unlocked, inserted_row.crown_id);
      END IF;
    END IF;
  END LOOP;

  newly_unlocked_crown_ids := unlocked;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_user_crowns(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_user_crowns(UUID) TO authenticated, service_role;
