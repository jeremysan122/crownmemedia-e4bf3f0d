
-- Toggle for Recent Unlocks visibility on profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_recent_unlocks boolean NOT NULL DEFAULT false;

-- Update recent_achievement_unlocks to also surface Achievement Crown unlocks
CREATE OR REPLACE FUNCTION public.recent_achievement_unlocks(_user_id uuid, _limit int DEFAULT 20)
RETURNS TABLE(
  achievement_id uuid,
  slug text,
  name text,
  rarity text,
  achievement_type text,
  completed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH combined AS (
    SELECT d.id AS achievement_id, d.slug, d.name, d.rarity,
           d.achievement_type, uap.completed_at
    FROM public.user_achievement_progress uap
    JOIN public.achievement_definitions d ON d.id = uap.achievement_id
    WHERE uap.user_id = _user_id
      AND uap.status = 'completed'
      AND d.is_secret = false
    UNION ALL
    SELECT c.id AS achievement_id, c.slug, c.name, c.rarity,
           'crown_unlock'::text AS achievement_type, uac.unlocked_at AS completed_at
    FROM public.user_achievement_crowns uac
    JOIN public.achievement_crowns c ON c.id = uac.crown_id
    WHERE uac.user_id = _user_id
      AND c.is_active = true
      AND c.is_secret = false
  )
  SELECT achievement_id, slug, name, rarity, achievement_type, completed_at
  FROM combined
  ORDER BY completed_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(_limit, 1), 100)
$$;
GRANT EXECUTE ON FUNCTION public.recent_achievement_unlocks(uuid, int) TO authenticated, anon;
