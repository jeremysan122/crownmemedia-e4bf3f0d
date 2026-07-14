
-- 1. Extend achievement_definitions
ALTER TABLE public.achievement_definitions
  ADD COLUMN IF NOT EXISTS reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Widen achievement_type check by dropping+re-adding if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'achievement_definitions_achievement_type_check') THEN
    ALTER TABLE public.achievement_definitions DROP CONSTRAINT achievement_definitions_achievement_type_check;
  END IF;
END $$;

ALTER TABLE public.achievement_definitions
  ADD CONSTRAINT achievement_definitions_achievement_type_check
  CHECK (achievement_type IN ('frame_unlock','badge_unlock','title_unlock','shekel_grant','boost_grant'));

-- 2. Collections presentation
ALTER TABLE public.avatar_frame_collections
  ADD COLUMN IF NOT EXISTS icon_slug text,
  ADD COLUMN IF NOT EXISTS description text;

-- 3. Badges catalog
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_slug text NOT NULL DEFAULT 'star',
  rarity text NOT NULL DEFAULT 'rare',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.badges TO authenticated, anon;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges readable" ON public.badges FOR SELECT TO authenticated, anon USING (is_active = true);
CREATE POLICY "badges admin write" ON public.badges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER _upd_badges BEFORE UPDATE ON public.badges FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4. Titles catalog
CREATE TABLE IF NOT EXISTS public.titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  text text NOT NULL,
  description text NOT NULL DEFAULT '',
  rarity text NOT NULL DEFAULT 'rare',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.titles TO authenticated, anon;
GRANT ALL ON public.titles TO service_role;
ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "titles readable" ON public.titles FOR SELECT TO authenticated, anon USING (is_active = true);
CREATE POLICY "titles admin write" ON public.titles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER _upd_titles BEFORE UPDATE ON public.titles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. User unlocks: badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_slug text NOT NULL REFERENCES public.badges(slug) ON DELETE CASCADE,
  achievement_id uuid REFERENCES public.achievement_definitions(id) ON DELETE SET NULL,
  equipped boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_slug)
);
GRANT SELECT, UPDATE ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_badges owner read" ON public.user_badges FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "user_badges owner update equipped" ON public.user_badges FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);

-- 6. User unlocks: titles
CREATE TABLE IF NOT EXISTS public.user_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_slug text NOT NULL REFERENCES public.titles(slug) ON DELETE CASCADE,
  achievement_id uuid REFERENCES public.achievement_definitions(id) ON DELETE SET NULL,
  equipped boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, title_slug)
);
GRANT SELECT, UPDATE ON public.user_titles TO authenticated;
GRANT ALL ON public.user_titles TO service_role;
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_titles owner read" ON public.user_titles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "user_titles owner update equipped" ON public.user_titles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_titles_user ON public.user_titles(user_id);

-- Public read for equipped title/badge on a profile
CREATE POLICY "user_titles equipped public" ON public.user_titles FOR SELECT TO authenticated, anon
  USING (equipped = true);
CREATE POLICY "user_badges equipped public" ON public.user_badges FOR SELECT TO authenticated, anon
  USING (equipped = true);
GRANT SELECT ON public.user_titles TO anon;
GRANT SELECT ON public.user_badges TO anon;

-- 7. Equip RPCs
CREATE OR REPLACE FUNCTION public.equip_title(_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.user_titles SET equipped = false WHERE user_id = auth.uid();
  IF _slug IS NOT NULL THEN
    UPDATE public.user_titles SET equipped = true
      WHERE user_id = auth.uid() AND title_slug = _slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'title not owned'; END IF;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.equip_title(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.equip_badge(_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.user_badges SET equipped = false WHERE user_id = auth.uid();
  IF _slug IS NOT NULL THEN
    UPDATE public.user_badges SET equipped = true
      WHERE user_id = auth.uid() AND badge_slug = _slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'badge not owned'; END IF;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.equip_badge(text) TO authenticated;

-- 8. Profile-level fetch for equipped decorations
CREATE OR REPLACE FUNCTION public.profile_decorations(_user_id uuid)
RETURNS TABLE(title_slug text, title_text text, title_rarity text, badge_slug text, badge_name text, badge_icon text, badge_rarity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT t.slug FROM public.user_titles ut JOIN public.titles t ON t.slug = ut.title_slug WHERE ut.user_id = _user_id AND ut.equipped LIMIT 1),
    (SELECT t.text FROM public.user_titles ut JOIN public.titles t ON t.slug = ut.title_slug WHERE ut.user_id = _user_id AND ut.equipped LIMIT 1),
    (SELECT t.rarity FROM public.user_titles ut JOIN public.titles t ON t.slug = ut.title_slug WHERE ut.user_id = _user_id AND ut.equipped LIMIT 1),
    (SELECT b.slug FROM public.user_badges ub JOIN public.badges b ON b.slug = ub.badge_slug WHERE ub.user_id = _user_id AND ub.equipped LIMIT 1),
    (SELECT b.name FROM public.user_badges ub JOIN public.badges b ON b.slug = ub.badge_slug WHERE ub.user_id = _user_id AND ub.equipped LIMIT 1),
    (SELECT b.icon_slug FROM public.user_badges ub JOIN public.badges b ON b.slug = ub.badge_slug WHERE ub.user_id = _user_id AND ub.equipped LIMIT 1),
    (SELECT b.rarity FROM public.user_badges ub JOIN public.badges b ON b.slug = ub.badge_slug WHERE ub.user_id = _user_id AND ub.equipped LIMIT 1)
$$;
GRANT EXECUTE ON FUNCTION public.profile_decorations(uuid) TO authenticated, anon;

-- 9. Recent unlocks feed for profile
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
  SELECT d.id, d.slug, d.name, d.rarity, d.achievement_type, uap.completed_at
  FROM public.user_achievement_progress uap
  JOIN public.achievement_definitions d ON d.id = uap.achievement_id
  WHERE uap.user_id = _user_id
    AND uap.status = 'completed'
    AND d.is_secret = false
  ORDER BY uap.completed_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(_limit, 1), 100)
$$;
GRANT EXECUTE ON FUNCTION public.recent_achievement_unlocks(uuid, int) TO authenticated, anon;

-- 10. Seed catalog: badges
INSERT INTO public.badges (slug, name, description, icon_slug, rarity, display_order) VALUES
  ('first-battle',     'First Battle',      'Entered your first battle.',           'swords',    'common',   1),
  ('first-crown',      'First Crown',       'Earned your first crown.',             'crown',     'rare',     2),
  ('streak-7',         'Weeklong Reign',    '7-day activity streak.',               'flame',     'rare',     3),
  ('streak-30',        'Monthlong Reign',   '30-day activity streak.',              'flame',     'epic',     4),
  ('streak-100',       'Century Reign',     '100-day activity streak.',             'flame',     'legendary',5),
  ('verified-voter',   'Verified Voter',    'Cast 100 verified votes.',             'check',     'rare',     6),
  ('top-fan',          'Top Fan',           'Followed 50 battlers.',                'heart',     'rare',     7),
  ('summer-2026',      'Summer 2026',       'Participated in the Summer 2026 event.','sun',       'epic',     8)
ON CONFLICT (slug) DO NOTHING;

-- 11. Seed catalog: titles
INSERT INTO public.titles (slug, text, description, rarity, display_order) VALUES
  ('contender',   'Contender',   'Fought in at least 5 battles.',   'rare',      1),
  ('champion',    'Champion',    'Won 25 battles.',                 'epic',      2),
  ('legend',      'Legend',      'Won 100 battles.',                'legendary', 3),
  ('royal-voice', 'Royal Voice', 'Received 1,000 comments.',        'epic',      4),
  ('the-sovereign','The Sovereign','Ranked #1 in any category.',    'mythic',    5)
ON CONFLICT (slug) DO NOTHING;

-- 12. Seed non-frame achievement definitions
INSERT INTO public.achievement_definitions (slug, name, description, rarity, achievement_type, reward_payload, requirement_logic, is_founder_only, is_secret, is_repeatable, display_order)
VALUES
  ('ach-first-battle',   'First Blood',        'Enter your first battle.',                    'common',    'badge_unlock', '{"badge_slug":"first-battle"}',       '{"metric":"battles_entered","target":1}',       false, false, false, 1001),
  ('ach-first-crown',    'Crowned',            'Earn your first crown.',                      'rare',      'badge_unlock', '{"badge_slug":"first-crown"}',        '{"metric":"crowns","target":1}',                false, false, false, 1002),
  ('ach-streak-7',       'Weeklong Reign',     'Stay active 7 days in a row.',                'rare',      'badge_unlock', '{"badge_slug":"streak-7"}',           '{"metric":"streak_days","target":7}',           false, false, false, 1003),
  ('ach-streak-30',      'Monthlong Reign',    'Stay active 30 days in a row.',               'epic',      'badge_unlock', '{"badge_slug":"streak-30"}',          '{"metric":"streak_days","target":30}',          false, false, false, 1004),
  ('ach-streak-100',     'Century Reign',      'Stay active 100 days in a row.',              'legendary', 'badge_unlock', '{"badge_slug":"streak-100"}',         '{"metric":"streak_days","target":100}',         false, false, false, 1005),
  ('ach-verified-voter', 'Verified Voter',     'Cast 100 verified votes.',                    'rare',      'badge_unlock', '{"badge_slug":"verified-voter"}',     '{"metric":"votes_cast","target":100}',          false, false, false, 1006),
  ('ach-top-fan',        'Top Fan',            'Follow 50 battlers.',                         'rare',      'badge_unlock', '{"badge_slug":"top-fan"}',            '{"metric":"battlers_followed","target":50}',    false, false, false, 1007),
  ('ach-contender',      'Contender',          'Fight in at least 5 battles.',                'rare',      'title_unlock', '{"title_slug":"contender"}',          '{"metric":"battles_entered","target":5}',       false, false, false, 1008),
  ('ach-champion',       'Champion',           'Win 25 battles.',                             'epic',      'title_unlock', '{"title_slug":"champion"}',           '{"metric":"battles_won","target":25}',          false, false, false, 1009),
  ('ach-legend',         'Legend',             'Win 100 battles.',                            'legendary', 'title_unlock', '{"title_slug":"legend"}',             '{"metric":"battles_won","target":100}',         false, false, false, 1010),
  ('ach-royal-voice',    'Royal Voice',        'Receive 1,000 comments across your posts.',   'epic',      'title_unlock', '{"title_slug":"royal-voice"}',        '{"metric":"comments_received","target":1000}',  false, false, false, 1011),
  ('ach-sovereign',      'The Sovereign',      'Rank #1 in any category.',                    'mythic',    'title_unlock', '{"title_slug":"the-sovereign"}',      '{"metric":"category_rank_1","target":1}',       false, false, false, 1012),
  ('ach-secret-nightowl','???',                'A hidden achievement waits in the moonlight.','epic',      'badge_unlock', '{"badge_slug":"streak-7"}',           '{"metric":"active_after_midnight","target":10}',false, true,  false, 1013),
  ('ach-secret-comeback','???',                'A hidden achievement rewards persistence.',   'epic',      'shekel_grant', '{"amount":500}',                      '{"metric":"comeback_wins","target":1}',         false, true,  false, 1014),
  ('ach-secret-firstgift','???',               'A hidden achievement for the generous.',      'rare',      'shekel_grant', '{"amount":100}',                      '{"metric":"gifts_sent","target":1}',            false, true,  false, 1015),
  ('ach-secret-founder-friend','???',          'A hidden achievement for the well-connected.','epic',      'badge_unlock', '{"badge_slug":"top-fan"}',            '{"metric":"founder_follows","target":3}',       false, true,  false, 1016),
  ('ach-secret-earlybird','???',               'A hidden achievement for the early risers.',  'rare',      'shekel_grant', '{"amount":250}',                      '{"metric":"active_before_6am","target":10}',    false, true,  false, 1017),
  ('ach-weekly-voter',   'Weekly Voter',       'Cast 20 votes in a single week.',             'common',    'shekel_grant', '{"amount":50}',                       '{"metric":"votes_cast_weekly","target":20}',    false, false, true,  1018),
  ('ach-weekly-battler', 'Weekly Battler',     'Enter 3 battles in a single week.',           'rare',      'shekel_grant', '{"amount":100}',                      '{"metric":"battles_entered_weekly","target":3}',false, false, true,  1019),
  ('ach-weekly-social',  'Weekly Socialite',   'Comment on 25 posts in a single week.',       'common',    'shekel_grant', '{"amount":75}',                       '{"metric":"comments_weekly","target":25}',      false, false, true,  1020),
  ('ach-summer-2026',    'Summer Sovereign',   'Enter 3 battles during Summer 2026.',         'epic',      'badge_unlock', '{"badge_slug":"summer-2026"}',        '{"metric":"battles_entered_seasonal","target":3}', false, false, false, 1021)
ON CONFLICT (slug) DO NOTHING;

-- Seasonal window on Summer Sovereign
UPDATE public.achievement_definitions
  SET starts_at = '2026-06-01 00:00:00+00', ends_at = '2026-09-30 23:59:59+00'
  WHERE slug = 'ach-summer-2026';

-- 13. Rebalance: make most frame achievements non-founder-only, keep only the 6 rarest
UPDATE public.achievement_definitions
  SET is_founder_only = false
  WHERE achievement_type = 'frame_unlock'
    AND rarity NOT IN ('mythic');
