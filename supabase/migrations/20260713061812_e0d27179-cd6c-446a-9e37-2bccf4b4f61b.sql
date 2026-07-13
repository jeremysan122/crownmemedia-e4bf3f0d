
-- 1. Frame unlocks table
CREATE TABLE public.avatar_frame_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frame_key text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, frame_key)
);

GRANT SELECT ON public.avatar_frame_unlocks TO authenticated;
GRANT ALL ON public.avatar_frame_unlocks TO service_role;

ALTER TABLE public.avatar_frame_unlocks ENABLE ROW LEVEL SECURITY;

-- Users can read all unlocks (needed to render frames on other users' profiles)
CREATE POLICY "avatar_frame_unlocks_read_all"
  ON public.avatar_frame_unlocks FOR SELECT
  TO authenticated
  USING (true);

-- No direct insert/update/delete from clients — only security-definer RPCs

CREATE INDEX idx_avatar_frame_unlocks_user ON public.avatar_frame_unlocks(user_id);

-- 2. Equipped frame column on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_frame_key text;

-- 3. Stats helper: compute the caller's raw achievement metrics
CREATE OR REPLACE FUNCTION public.frame_reward_stats(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  crowns_count int := 0;
  battles_won int := 0;
  longest_streak int := 0;
  shields_used int := 0;
  is_royal boolean := false;
  is_founder_v boolean := false;
BEGIN
  SELECT COUNT(*) INTO crowns_count FROM public.crowns WHERE user_id = _user_id;
  SELECT COUNT(*) INTO battles_won FROM public.battles WHERE winner_id = _user_id;
  SELECT COALESCE(MAX(longest_streak), 0) INTO longest_streak FROM public.daily_streaks WHERE user_id = _user_id;
  BEGIN
    SELECT COALESCE(SUM(shields_used), 0) INTO shields_used
      FROM public.royal_pass_shield_allowances WHERE user_id = _user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    shields_used := 0;
  END;
  BEGIN
    SELECT public.is_royal_pass_active(_user_id) INTO is_royal;
  EXCEPTION WHEN undefined_function THEN
    is_royal := false;
  END;
  BEGIN
    SELECT COALESCE(is_founder, false) INTO is_founder_v
      FROM public.profiles WHERE id = _user_id;
  EXCEPTION WHEN undefined_column THEN
    is_founder_v := false;
  END;

  RETURN jsonb_build_object(
    'crowns', crowns_count,
    'battles_won', battles_won,
    'longest_streak', longest_streak,
    'shields_used', shields_used,
    'is_royal', is_royal,
    'is_founder', is_founder_v
  );
END;
$$;

REVOKE ALL ON FUNCTION public.frame_reward_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.frame_reward_stats(uuid) TO authenticated, service_role;

-- 4. check_and_award_frames() — insert unlocks user has newly earned
CREATE OR REPLACE FUNCTION public.check_and_award_frames()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      WHEN 'crown-prestige'  THEN (s->>'crowns')::int >= 1
      WHEN 'royal-purple'    THEN (s->>'is_royal')::boolean
      WHEN 'golden-majesty'  THEN (s->>'battles_won')::int >= 10
      WHEN 'royal-laurel'    THEN (s->>'battles_won')::int >= 25
      WHEN 'diamond-royal'   THEN (s->>'crowns')::int >= 5
      WHEN 'royal-sovereign' THEN (s->>'crowns')::int >= 15
      WHEN 'midnight-royal'  THEN (s->>'longest_streak')::int >= 30
      WHEN 'royal-shield'    THEN (s->>'shields_used')::int >= 10
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
$$;

REVOKE ALL ON FUNCTION public.check_and_award_frames() FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_award_frames() TO authenticated, service_role;

-- 5. my_frame_progress() — return each frame with progress + unlocked + equipped
CREATE OR REPLACE FUNCTION public.my_frame_progress()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    jsonb_build_object('key','crown-prestige','label','Crown Prestige','requirement','Win your first crown',
      'progress',(s->>'crowns')::int,'target',1,
      'unlocked','crown-prestige' = ANY(unlocked_keys),'equipped',equipped = 'crown-prestige'),
    jsonb_build_object('key','royal-purple','label','Royal Purple','requirement','Activate Royal Pass',
      'progress',CASE WHEN (s->>'is_royal')::boolean THEN 1 ELSE 0 END,'target',1,
      'unlocked','royal-purple' = ANY(unlocked_keys),'equipped',equipped = 'royal-purple'),
    jsonb_build_object('key','golden-majesty','label','Golden Majesty','requirement','Win 10 battles',
      'progress',(s->>'battles_won')::int,'target',10,
      'unlocked','golden-majesty' = ANY(unlocked_keys),'equipped',equipped = 'golden-majesty'),
    jsonb_build_object('key','royal-laurel','label','Royal Laurel','requirement','Win 25 battles',
      'progress',(s->>'battles_won')::int,'target',25,
      'unlocked','royal-laurel' = ANY(unlocked_keys),'equipped',equipped = 'royal-laurel'),
    jsonb_build_object('key','diamond-royal','label','Diamond Royal','requirement','Earn 5 crowns',
      'progress',(s->>'crowns')::int,'target',5,
      'unlocked','diamond-royal' = ANY(unlocked_keys),'equipped',equipped = 'diamond-royal'),
    jsonb_build_object('key','royal-sovereign','label','Royal Sovereign','requirement','Earn 15 crowns',
      'progress',(s->>'crowns')::int,'target',15,
      'unlocked','royal-sovereign' = ANY(unlocked_keys),'equipped',equipped = 'royal-sovereign'),
    jsonb_build_object('key','midnight-royal','label','Midnight Royal','requirement','Reach a 30-day login streak',
      'progress',(s->>'longest_streak')::int,'target',30,
      'unlocked','midnight-royal' = ANY(unlocked_keys),'equipped',equipped = 'midnight-royal'),
    jsonb_build_object('key','royal-shield','label','Royal Shield','requirement','Use 10 Crown Shields',
      'progress',(s->>'shields_used')::int,'target',10,
      'unlocked','royal-shield' = ANY(unlocked_keys),'equipped',equipped = 'royal-shield'),
    jsonb_build_object('key','imperial-glow','label','Imperial Glow','requirement','Founding Royal Member',
      'progress',CASE WHEN (s->>'is_founder')::boolean THEN 1 ELSE 0 END,'target',1,
      'unlocked','imperial-glow' = ANY(unlocked_keys),'equipped',equipped = 'imperial-glow')
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.my_frame_progress() FROM public;
GRANT EXECUTE ON FUNCTION public.my_frame_progress() TO authenticated, service_role;

-- 6. equip_frame(text) — set equipped frame if unlocked
CREATE OR REPLACE FUNCTION public.equip_frame(_frame_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_unlocked boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF _frame_key IS NULL OR _frame_key = '' THEN
    UPDATE public.profiles SET equipped_frame_key = NULL WHERE id = uid;
    RETURN jsonb_build_object('success', true, 'equipped', null);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.avatar_frame_unlocks
    WHERE user_id = uid AND frame_key = _frame_key
  ) INTO is_unlocked;

  IF NOT is_unlocked THEN
    RAISE EXCEPTION 'frame_not_unlocked';
  END IF;

  UPDATE public.profiles SET equipped_frame_key = _frame_key WHERE id = uid;
  RETURN jsonb_build_object('success', true, 'equipped', _frame_key);
END;
$$;

REVOKE ALL ON FUNCTION public.equip_frame(text) FROM public;
GRANT EXECUTE ON FUNCTION public.equip_frame(text) TO authenticated, service_role;
