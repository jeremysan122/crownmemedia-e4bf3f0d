
CREATE OR REPLACE FUNCTION public.check_and_award_frames()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  s jsonb;
  awarded text[] := ARRAY[]::text[];
  keys_to_check text[];
  k text;
  eligible boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  s := public.frame_reward_stats(uid);

  keys_to_check := ARRAY[
    'crown-prestige','royal-purple','golden-majesty','royal-laurel',
    'diamond-royal','royal-sovereign','midnight-royal','royal-shield','imperial-glow'
  ];

  FOREACH k IN ARRAY keys_to_check LOOP
    eligible := CASE k
      WHEN 'crown-prestige'  THEN (s->>'crowns')::int >= 100
      WHEN 'royal-purple'    THEN (s->>'is_royal')::boolean
      WHEN 'golden-majesty'  THEN (s->>'battles_won')::int >= 100
      WHEN 'royal-laurel'    THEN (s->>'battles_won')::int >= 500
      WHEN 'diamond-royal'   THEN (s->>'crowns')::int >= 1000
      WHEN 'royal-sovereign' THEN (s->>'crowns')::int >= 10000
      WHEN 'midnight-royal'  THEN (s->>'longest_streak')::int >= 100
      WHEN 'royal-shield'    THEN (s->>'shields_used')::int >= 100
      WHEN 'imperial-glow'   THEN (s->>'is_founder')::boolean
      ELSE false
    END;
    IF eligible THEN
      INSERT INTO public.avatar_frame_unlocks (user_id, frame_key)
        VALUES (uid, k)
        ON CONFLICT (user_id, frame_key) DO NOTHING;
      IF FOUND THEN awarded := awarded || k; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('awarded', to_jsonb(awarded), 'stats', s);
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_frame_progress()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  s jsonb;
  equipped text;
  unlocked_keys text[];
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  s := public.frame_reward_stats(uid);
  SELECT equipped_frame_key INTO equipped FROM public.profiles WHERE id = uid;
  SELECT COALESCE(array_agg(frame_key), ARRAY[]::text[]) INTO unlocked_keys
    FROM public.avatar_frame_unlocks WHERE user_id = uid;

  result := jsonb_build_array(
    jsonb_build_object('key','crown-prestige','label','Crown Prestige','requirement','Earn 100 crowns',
      'progress',(s->>'crowns')::int,'target',100,
      'unlocked','crown-prestige' = ANY(unlocked_keys),'equipped',equipped = 'crown-prestige'),
    jsonb_build_object('key','royal-purple','label','Royal Purple','requirement','Activate Royal Pass',
      'progress',CASE WHEN (s->>'is_royal')::boolean THEN 1 ELSE 0 END,'target',1,
      'unlocked','royal-purple' = ANY(unlocked_keys),'equipped',equipped = 'royal-purple'),
    jsonb_build_object('key','golden-majesty','label','Golden Majesty','requirement','Win 100 battles',
      'progress',(s->>'battles_won')::int,'target',100,
      'unlocked','golden-majesty' = ANY(unlocked_keys),'equipped',equipped = 'golden-majesty'),
    jsonb_build_object('key','royal-laurel','label','Royal Laurel','requirement','Win 500 battles',
      'progress',(s->>'battles_won')::int,'target',500,
      'unlocked','royal-laurel' = ANY(unlocked_keys),'equipped',equipped = 'royal-laurel'),
    jsonb_build_object('key','diamond-royal','label','Diamond Royal','requirement','Earn 1,000 crowns',
      'progress',(s->>'crowns')::int,'target',1000,
      'unlocked','diamond-royal' = ANY(unlocked_keys),'equipped',equipped = 'diamond-royal'),
    jsonb_build_object('key','royal-sovereign','label','Royal Sovereign','requirement','Earn 10,000 crowns',
      'progress',(s->>'crowns')::int,'target',10000,
      'unlocked','royal-sovereign' = ANY(unlocked_keys),'equipped',equipped = 'royal-sovereign'),
    jsonb_build_object('key','midnight-royal','label','Midnight Royal','requirement','Reach a 100-day login streak',
      'progress',(s->>'longest_streak')::int,'target',100,
      'unlocked','midnight-royal' = ANY(unlocked_keys),'equipped',equipped = 'midnight-royal'),
    jsonb_build_object('key','royal-shield','label','Royal Shield','requirement','Use 100 Crown Shields',
      'progress',(s->>'shields_used')::int,'target',100,
      'unlocked','royal-shield' = ANY(unlocked_keys),'equipped',equipped = 'royal-shield'),
    jsonb_build_object('key','imperial-glow','label','Imperial Glow','requirement','Founding Royal Member',
      'progress',CASE WHEN (s->>'is_founder')::boolean THEN 1 ELSE 0 END,'target',1,
      'unlocked','imperial-glow' = ANY(unlocked_keys),'equipped',equipped = 'imperial-glow')
  );
  RETURN result;
END;
$function$;
