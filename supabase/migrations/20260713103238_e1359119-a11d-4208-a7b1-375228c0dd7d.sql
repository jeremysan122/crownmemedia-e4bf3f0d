
-- =========================================================================
-- WAVE 1: Achievement + 81 Avatar Frame System — schema, RLS, seed
-- =========================================================================

-- ---------- feature flags ----------
INSERT INTO public.feature_flags (key, enabled, description)
VALUES
  ('achievement_system_enabled', true,  'Master switch for the achievement + avatar frame system (admins/testers).'),
  ('achievement_system_public_launch', false, 'Public rollout of the achievement system.'),
  ('achievement_weekly_quests_enabled', false, 'Weekly quest surface.'),
  ('achievement_animations_enabled', false, 'Animated frame effects (Lottie/WebM).'),
  ('founder_achievements_enabled', true, 'Founder achievement collections (internal testing).')
ON CONFLICT (key) DO NOTHING;

-- ---------- helper: updated_at ----------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================================================
-- avatar_frame_collections
-- =========================================================================
CREATE TABLE public.avatar_frame_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  collection_type text NOT NULL DEFAULT 'standard',
  is_founder_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.avatar_frame_collections TO authenticated, anon;
GRANT ALL ON public.avatar_frame_collections TO service_role;
ALTER TABLE public.avatar_frame_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collections readable"
  ON public.avatar_frame_collections FOR SELECT TO authenticated, anon
  USING (is_active = true);
CREATE POLICY "collections admin all"
  ON public.avatar_frame_collections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER _upd_avatar_frame_collections BEFORE UPDATE ON public.avatar_frame_collections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- avatar_frames
-- =========================================================================
CREATE TABLE public.avatar_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.avatar_frame_collections(id) ON DELETE RESTRICT,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  rarity text NOT NULL DEFAULT 'rare',
  display_order integer NOT NULL DEFAULT 0,
  static_asset_url text,
  animated_asset_url text,
  thumbnail_asset_url text,
  asset_status text NOT NULL DEFAULT 'pending',
  is_animated boolean NOT NULL DEFAULT false,
  is_founder_only boolean NOT NULL DEFAULT false,
  is_secret boolean NOT NULL DEFAULT false,
  is_limited_time boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  ownership_type text NOT NULL DEFAULT 'permanent',
  active_animation_required_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_avatar_frames_collection ON public.avatar_frames(collection_id, display_order);
CREATE INDEX idx_avatar_frames_status ON public.avatar_frames(asset_status);
GRANT SELECT ON public.avatar_frames TO authenticated, anon;
GRANT ALL ON public.avatar_frames TO service_role;
ALTER TABLE public.avatar_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frames readable (non-secret + in window)"
  ON public.avatar_frames FOR SELECT TO authenticated, anon
  USING (
    is_secret = false
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );
CREATE POLICY "frames admin all"
  ON public.avatar_frames FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER _upd_avatar_frames BEFORE UPDATE ON public.avatar_frames
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- user_avatar_frames (ownership)
-- =========================================================================
CREATE TABLE public.user_avatar_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_frame_id uuid NOT NULL REFERENCES public.avatar_frames(id) ON DELETE RESTRICT,
  achievement_id uuid,
  grant_source text NOT NULL DEFAULT 'achievement',
  grant_source_id uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_permanent boolean NOT NULL DEFAULT true,
  is_revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, avatar_frame_id)
);
CREATE INDEX idx_user_avatar_frames_user ON public.user_avatar_frames(user_id) WHERE is_revoked = false;
GRANT SELECT ON public.user_avatar_frames TO authenticated;
GRANT ALL ON public.user_avatar_frames TO service_role;
ALTER TABLE public.user_avatar_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ownership readable"
  ON public.user_avatar_frames FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ownership admin write"
  ON public.user_avatar_frames FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER _upd_user_avatar_frames BEFORE UPDATE ON public.user_avatar_frames
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- achievement_definitions
-- =========================================================================
CREATE TABLE public.achievement_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  collection_id uuid REFERENCES public.avatar_frame_collections(id) ON DELETE SET NULL,
  avatar_frame_id uuid REFERENCES public.avatar_frames(id) ON DELETE SET NULL,
  rarity text NOT NULL DEFAULT 'rare',
  achievement_type text NOT NULL DEFAULT 'frame_unlock',
  is_founder_only boolean NOT NULL DEFAULT false,
  is_secret boolean NOT NULL DEFAULT false,
  is_repeatable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  minimum_account_age_days integer NOT NULL DEFAULT 0,
  minimum_qualified_active_days integer NOT NULL DEFAULT 0,
  minimum_distinct_active_weeks integer NOT NULL DEFAULT 0,
  requirement_logic jsonb NOT NULL DEFAULT '{}'::jsonb,
  checkpoint_rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ach_def_collection ON public.achievement_definitions(collection_id, display_order);
GRANT SELECT ON public.achievement_definitions TO authenticated;
GRANT ALL ON public.achievement_definitions TO service_role;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "definitions readable (non-secret and active)"
  ON public.achievement_definitions FOR SELECT TO authenticated
  USING (
    (is_secret = false AND is_active = true)
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "definitions admin write"
  ON public.achievement_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER _upd_ach_def BEFORE UPDATE ON public.achievement_definitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- user_achievement_progress
-- =========================================================================
CREATE TABLE public.user_achievement_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievement_definitions(id) ON DELETE CASCADE,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_percent numeric NOT NULL DEFAULT 0,
  highest_checkpoint integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_progress_at timestamptz,
  completed_at timestamptz,
  claimed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
CREATE INDEX idx_user_ach_progress_user ON public.user_achievement_progress(user_id, status);
CREATE INDEX idx_user_ach_progress_ach ON public.user_achievement_progress(achievement_id);
GRANT SELECT ON public.user_achievement_progress TO authenticated;
GRANT ALL ON public.user_achievement_progress TO service_role;
ALTER TABLE public.user_achievement_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress readable"
  ON public.user_achievement_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "progress admin write"
  ON public.user_achievement_progress FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER _upd_user_ach_progress BEFORE UPDATE ON public.user_achievement_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- achievement_progress_events (idempotent queue)
-- =========================================================================
CREATE TABLE public.achievement_progress_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid REFERENCES public.achievement_definitions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source_table text,
  source_id uuid,
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_key text UNIQUE NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending',
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ach_events_status ON public.achievement_progress_events(processing_status, occurred_at);
CREATE INDEX idx_ach_events_user ON public.achievement_progress_events(user_id, occurred_at DESC);
GRANT SELECT ON public.achievement_progress_events TO authenticated;
GRANT ALL ON public.achievement_progress_events TO service_role;
ALTER TABLE public.achievement_progress_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events readable admin"
  ON public.achievement_progress_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- user_achievement_rewards (checkpoint grants)
-- =========================================================================
CREATE TABLE public.user_achievement_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievement_definitions(id) ON DELETE CASCADE,
  checkpoint integer NOT NULL,
  reward_type text NOT NULL,
  reward_id uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_revoked boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id, checkpoint, reward_type)
);
CREATE INDEX idx_ach_rewards_user ON public.user_achievement_rewards(user_id);
GRANT SELECT ON public.user_achievement_rewards TO authenticated;
GRANT ALL ON public.user_achievement_rewards TO service_role;
ALTER TABLE public.user_achievement_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rewards readable"
  ON public.user_achievement_rewards FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "rewards admin write"
  ON public.user_achievement_rewards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- user_active_days
-- =========================================================================
CREATE TABLE public.user_active_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  first_qualifying_event_type text,
  first_qualifying_event_id uuid,
  qualifying_action_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_date)
);
CREATE INDEX idx_user_active_days_user ON public.user_active_days(user_id, activity_date DESC);
GRANT SELECT ON public.user_active_days TO authenticated;
GRANT ALL ON public.user_active_days TO service_role;
ALTER TABLE public.user_active_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own active days readable"
  ON public.user_active_days FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- weekly quests
-- =========================================================================
CREATE TABLE public.weekly_quest_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  requirement_logic jsonb NOT NULL DEFAULT '{}'::jsonb,
  rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.weekly_quest_definitions TO authenticated;
GRANT ALL ON public.weekly_quest_definitions TO service_role;
ALTER TABLE public.weekly_quest_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wq def readable"
  ON public.weekly_quest_definitions FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "wq def admin write"
  ON public.weekly_quest_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.user_weekly_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.weekly_quest_definitions(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_percent numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_id, week_start)
);
CREATE INDEX idx_uwq_user ON public.user_weekly_quests(user_id, week_start DESC);
GRANT SELECT ON public.user_weekly_quests TO authenticated;
GRANT ALL ON public.user_weekly_quests TO service_role;
ALTER TABLE public.user_weekly_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own uwq readable"
  ON public.user_weekly_quests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- profiles.equipped_avatar_frame_id
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_avatar_frame_id uuid REFERENCES public.avatar_frames(id) ON DELETE SET NULL;

-- =========================================================================
-- SEED: 9 collections
-- =========================================================================
INSERT INTO public.avatar_frame_collections (slug, name, description, display_order, collection_type, is_founder_only)
VALUES
  ('royal-prestige',   'Royal Prestige',   'Foundational prestige frames for dedicated CrownMe royals.', 1, 'standard', false),
  ('founder-legacy',   'Founder Legacy',   'The Founding Royals chronicle.', 2, 'founder', true),
  ('founder-vanguard', 'Founder Vanguard', 'Founder frames for pioneers of the frontier.', 3, 'founder', true),
  ('founder-ascension','Founder Ascension','Founder frames for those who rose above.', 4, 'founder', true),
  ('founder-origins',  'Founder Origins',  'Founder frames honoring earliest architects.', 5, 'founder', true),
  ('founder-eternal',  'Founder Eternal',  'Founder frames of eternal impact.', 6, 'founder', true),
  ('royal-elements',   'Royal Elements',   'Elemental frames earned by competition mastery.', 7, 'standard', false),
  ('royal-ascension',  'Royal Ascension',  'Ascended prestige frames for long-tenured royals.', 8, 'standard', false),
  ('royal-dominion',   'Royal Dominion',   'The rarest non-Founder frames — dominion tier.', 9, 'standard', false);

-- =========================================================================
-- SEED: 81 avatar_frames + 81 achievement_definitions
-- =========================================================================
-- Helper: seed both frame + achievement for a slug in one shot.
DO $$
DECLARE
  v_col uuid;
  v_frame_id uuid;
  v_ach_id uuid;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- (col_slug, order, frame_slug, name, rarity, founder_only, requirement_json, description)
      -- Collection 1: Royal Prestige
      ('royal-prestige',1,'crown-prestige','Crown Prestige','rare',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"qualifying_posts":25,"qualified_battle_wins":25,"qualified_votes_received":2500}}',
        'Five hundred crowns strong — the first mark of prestige.'),
      ('royal-prestige',2,'royal-purple','Royal Purple','rare',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"qualifying_posts":100,"qualified_votes_received":10000,"legitimate_followers":1000}}',
        'Reserved for royals with genuine reach.'),
      ('royal-prestige',3,'golden-majesty','Golden Majesty','epic',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"qualifying_posts":250,"qualified_votes_received":50000,"qualified_battle_wins":100}}',
        'A proven battler with sustained majesty.'),
      ('royal-prestige',4,'royal-laurel','Royal Laurel','epic',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"city_crown_hold_days":30,"crown_defenses":100}}',
        'Defender laureled by the city itself.'),
      ('royal-prestige',5,'diamond-royal','Diamond Royal','legendary',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"qualified_votes_received":250000,"qualified_content_views":5000000,"legitimate_followers":25000}}',
        'Diamond-forged influence across CrownMe.'),
      ('royal-prestige',6,'royal-sovereign','Royal Sovereign','legendary',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"simultaneous_crowns":5,"qualified_active_days":250}}',
        'Apex of the leaderboard.'),
      ('royal-prestige',7,'midnight-royal','Midnight Royal','legendary',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"global_top100_cumulative_days":30}}',
        'A month among the global elite.'),
      ('royal-prestige',8,'royal-shield','Royal Shield','legendary',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"crown_defenses":250,"months_without_serious_violation":12}}',
        'Defender of the crown.'),
      ('royal-prestige',9,'imperial-glow','Imperial Glow','mythic',false,
        '{"gates":{"account_age_days":90,"qualified_active_days":60,"distinct_active_weeks":12},"metrics":{"qualified_votes_received":1000000,"qualified_content_views":25000000,"qualified_battle_wins":1000,"qualified_active_days":500}}',
        'The imperial pinnacle of non-Founder prestige.'),

      -- Collection 2: Founder Legacy
      ('founder-legacy',1,'founder-origin-crown','Origin Crown','rare',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"founder_active_days":90,"qualifying_posts":50,"qualified_battle_wins":25}}',
        'The beginning of the Founding legacy.'),
      ('founder-legacy',2,'founder-visionary','Visionary','rare',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"qualifying_posts":250,"qualified_content_views":50000,"qualified_votes_received":10000}}',
        'Built for those who saw the future.'),
      ('founder-legacy',3,'founder-legacy-maker','Legacy Maker','epic',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"founder_days":365,"qualified_active_days":250,"legitimate_followers":5000}}',
        'You didn''t just join, you built.'),
      ('founder-legacy',4,'founder-pioneer','Pioneer','epic',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"qualified_referrals":50,"active_referrals_30d":25}}',
        'First in. Forever recognized.'),
      ('founder-legacy',5,'founder-crowned','Crowned Founder','epic',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"qualified_battle_wins":250,"qualified_live_battle_wins":50}}',
        'A true cornerstone of CrownMe.'),
      ('founder-legacy',6,'founder-elite','Elite Founder','legendary',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"top1_creator_quarters":3}}',
        'Excellence. Dedication. Impact.'),
      ('founder-legacy',7,'founder-timeless-royal','Timeless Royal','legendary',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"account_age_days":730,"qualified_active_days":500}}',
        'Enduring status. Eternal respect.'),
      ('founder-legacy',8,'founder-crown-architect','Crown Architect','legendary',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"accepted_beta_contributions":25,"qualified_referrals":100}}',
        'You helped shape the kingdom.'),
      ('founder-legacy',9,'founder-infinity','Infinity Founder','mythic',true,
        '{"founder_required":true,"gates":{"account_age_days":180,"qualified_active_days":120,"distinct_active_weeks":24},"metrics":{"account_age_days":1095,"qualified_active_days":750,"global_top100_cumulative_days":90}}',
        'Your impact has no limits.'),

      -- Collection 3: Founder Vanguard
      ('founder-vanguard',1,'founder-first-ignite','First Ignite','rare',true,
        '{"founder_required":true,"metrics":{"qualified_battle_wins":100,"win_streak":10,"qualified_active_days":100}}',
        'Where it all began.'),
      ('founder-vanguard',2,'founder-stellar-pioneer','Stellar Pioneer','rare',true,
        '{"founder_required":true,"metrics":{"qualified_content_views":1000000,"qualified_votes_received":100000}}',
        'Guiding the path forward.'),
      ('founder-vanguard',3,'founder-rooted-visionary','Rooted Visionary','epic',true,
        '{"founder_required":true,"metrics":{"qualified_active_days":365,"legitimate_followers":10000,"no_serious_violation":true}}',
        'Strong roots. Greater heights.'),
      ('founder-vanguard',4,'founder-code-breaker','Code Breaker','epic',true,
        '{"founder_required":true,"metrics":{"accepted_beta_contributions":50}}',
        'You built what others dream of.'),
      ('founder-vanguard',5,'founder-wayfinder','Wayfinder','epic',true,
        '{"founder_required":true,"metrics":{"wins_in_all_master_categories":true,"crowns_in_categories":5}}',
        'Purpose. Focus. Legacy.'),
      ('founder-vanguard',6,'founder-crystal-vanguard','Crystal Vanguard','legendary',true,
        '{"founder_required":true,"metrics":{"qualified_battle_wins":500,"win_rate_min_pct":65,"completed_battles":750}}',
        'Clarity. Courage. Crowned.'),
      ('founder-vanguard',7,'founder-horizon-seeker','Horizon Seeker','legendary',true,
        '{"founder_required":true,"metrics":{"qualified_referrals":100,"active_referrals_60d":50}}',
        'Explored early. Charted forever.'),
      ('founder-vanguard',8,'founder-stronghold','Stronghold Founder','legendary',true,
        '{"founder_required":true,"metrics":{"crown_defenses":250,"single_crown_hold_days":180}}',
        'Built the foundation. Hold the line.'),
      ('founder-vanguard',9,'founder-arcane-origin','Arcane Origin','mythic',true,
        '{"founder_required":true,"metrics":{"hidden_founder_missions_completed":7,"missions_span_years":2}}',
        'Magic meets mindset.'),

      -- Collection 4: Founder Ascension
      ('founder-ascension',1,'founder-pioneer-core','Pioneer Core','rare',true,
        '{"founder_required":true,"metrics":{"qualifying_posts":200,"distinct_active_weeks":40}}',
        'Built different. Built first.'),
      ('founder-ascension',2,'founder-legacy-builder','Legacy Builder','epic',true,
        '{"founder_required":true,"metrics":{"legitimate_followers":50000,"qualified_content_views":10000000}}',
        'Your vision. Our future.'),
      ('founder-ascension',3,'founder-stardust','Stardust Founder','epic',true,
        '{"founder_required":true,"metrics":{"qualified_content_views":25000000,"qualified_profile_views":1000000}}',
        'From idea to infinite.'),
      ('founder-ascension',4,'founder-rooted-legend','Rooted Legend','epic',true,
        '{"founder_required":true,"metrics":{"qualified_active_days":500,"distinct_active_weeks":100}}',
        'Strong roots. Lasting impact.'),
      ('founder-ascension',5,'founder-standard','Founder Standard','legendary',true,
        '{"founder_required":true,"metrics":{"paid_royal_periods_completed":18,"payment_disputes_open":0}}',
        'The mark of commitment.'),
      ('founder-ascension',6,'founder-tide-breaker','Tide Breaker','legendary',true,
        '{"founder_required":true,"metrics":{"qualified_battle_wins":1000,"qualified_live_battle_wins":100}}',
        'Making waves. Leading change.'),
      ('founder-ascension',7,'founder-digital-vanguard','Digital Vanguard','legendary',true,
        '{"founder_required":true,"metrics":{"live_battles_participated":250,"qualified_live_battle_wins":125}}',
        'Ahead of the curve.'),
      ('founder-ascension',8,'founder-zen','Zen Founder','legendary',true,
        '{"founder_required":true,"metrics":{"qualified_activity_streak_days":365,"serious_strike_during_streak":false}}',
        'Clarity. Balance. Creation.'),
      ('founder-ascension',9,'founder-ascendant','Ascendant','mythic',true,
        '{"founder_required":true,"metrics":{"national_top25_cumulative_days":90,"global_top250_cumulative_days":180}}',
        'Rising together. Higher purpose.'),

      -- Collection 5: Founder Origins
      ('founder-origins',1,'founder-first-circle','First Circle','rare',true,
        '{"founder_required":true,"metrics":{"first_100_founders":true,"qualified_active_days":250}}',
        'The first. The foundation.'),
      ('founder-origins',2,'founder-nexus','Nexus Founder','rare',true,
        '{"founder_required":true,"metrics":{"qualified_referrals":250,"active_referrals_90d":100}}',
        'Connected by purpose.'),
      ('founder-origins',3,'founder-origin-spark','Origin Spark','epic',true,
        '{"founder_required":true,"metrics":{"joined_during_founding_period":true,"active_years":2}}',
        'From a spark, a legacy.'),
      ('founder-origins',4,'founder-pathfinder','Pathfinder','epic',true,
        '{"founder_required":true,"metrics":{"crowns_in_categories":10,"city_crowns_total":25}}',
        'Blazing new trails.'),
      ('founder-origins',5,'founder-builders-circle','Builders Circle','epic',true,
        '{"founder_required":true,"metrics":{"active_referrals":100,"referrals_became_paid_royal":25}}',
        'Build. Grow. Inspire.'),
      ('founder-origins',6,'founder-infinity-mark','Infinity Mark','legendary',true,
        '{"founder_required":true,"metrics":{"qualified_active_days":1000,"distinct_active_weeks":150}}',
        'Limitless vision.'),
      ('founder-origins',7,'founder-code-origin','Code Origin','legendary',true,
        '{"founder_required":true,"metrics":{"accepted_beta_contributions":100}}',
        'Written in legacy.'),
      ('founder-origins',8,'founder-vanguard-crest','Vanguard Crest','legendary',true,
        '{"founder_required":true,"metrics":{"qualified_battle_wins":1500,"crown_defenses":300}}',
        'Courage leads.'),
      ('founder-origins',9,'founder-eclipse','Eclipse Founder','mythic',true,
        '{"founder_required":true,"metrics":{"annual_founder_event_wins":1}}',
        'Shaping the unseen.'),

      -- Collection 6: Founder Eternal
      ('founder-eternal',1,'founder-founders-edge','Founders Edge','epic',true,
        '{"founder_required":true,"metrics":{"city_top10_cumulative_days":365,"qualified_votes_received":500000}}',
        'Built different. Leading forward.'),
      ('founder-eternal',2,'founder-legacy-arch','Legacy Arch','epic',true,
        '{"founder_required":true,"metrics":{"top1_creator_quarters":4}}',
        'Timeless legacy. Endless impact.'),
      ('founder-eternal',3,'founder-liquid-origin','Liquid Origin','epic',true,
        '{"founder_required":true,"metrics":{"qualified_content_views":50000000,"qualified_votes_received":2000000}}',
        'Flow bold. Create change.'),
      ('founder-eternal',4,'founder-pioneer-path','Pioneer Path','legendary',true,
        '{"founder_required":true,"metrics":{"qualifying_posts":500,"distinct_active_weeks":100}}',
        'Blazing trails for tomorrow.'),
      ('founder-eternal',5,'founder-future-forge','Future Forge','legendary',true,
        '{"founder_required":true,"metrics":{"qualified_referrals":500,"active_referrals_90d":200}}',
        'Forging the future. Together.'),
      ('founder-eternal',6,'founder-zen-origin','Zen Origin','legendary',true,
        '{"founder_required":true,"metrics":{"activity_streak_days":500,"only_approved_freezes":true}}',
        'Focus within. Build without ego.'),
      ('founder-eternal',7,'founder-cosmic-vision','Cosmic Vision','mythic',true,
        '{"founder_required":true,"metrics":{"global_top100_cumulative_days":180,"qualified_content_views":100000000}}',
        'Dream bigger. Reach farther.'),
      ('founder-eternal',8,'founder-iron','Iron Founder','mythic',true,
        '{"founder_required":true,"metrics":{"qualified_battle_wins":2500,"win_rate_min_pct":70,"completed_battles":3000}}',
        'Strong mind. Stronger mission.'),
      ('founder-eternal',9,'founder-eternal-crest','Eternal Crest','mythic',true,
        '{"founder_required":true,"metrics":{"account_age_days":1095,"qualified_active_days":900,"legitimate_followers":100000,"qualified_votes_received":10000000}}',
        'Eternal vision. Eternal legacy.'),

      -- Collection 7: Royal Elements
      ('royal-elements',1,'solar-regalia','Solar Regalia','rare',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"qualified_battle_wins":100,"active_competition_days":50}}',
        'Shine with unwavering power.'),
      ('royal-elements',2,'frost-sovereign','Frost Sovereign','rare',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"qualified_battle_wins":250,"win_rate_min_pct":60,"completed_battles":400}}',
        'Cool mind. Bold reign.'),
      ('royal-elements',3,'natures-crown','Nature''s Crown','epic',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"qualifying_posts":250,"active_categories":5,"qualified_content_views":100000}}',
        'Rooted in growth. Born to lead.'),
      ('royal-elements',4,'dragons-ascent','Dragon''s Ascent','epic',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"qualified_battle_wins":500,"win_streak":20}}',
        'Rise higher. Rule stronger.'),
      ('royal-elements',5,'celestial-dynasty','Celestial Dynasty','legendary',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"qualified_votes_received":1000000,"qualified_content_views":10000000}}',
        'Written in stars. Guided by destiny.'),
      ('royal-elements',6,'neon-empire','Neon Empire','legendary',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"live_battles_participated":200,"qualified_live_views":100000}}',
        'Innovation today. Legacy tomorrow.'),
      ('royal-elements',7,'ocean-admiral','Ocean Admiral','legendary',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"qualified_battle_wins":1000,"city_crowns_total":10}}',
        'Navigate. Conquer. Reign.'),
      ('royal-elements',8,'obsidian-throne','Obsidian Throne','legendary',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"crown_defenses":500,"battle_top50_cumulative_days":90}}',
        'Strength in silence. Power in presence.'),
      ('royal-elements',9,'phoenix-reign','Phoenix Reign','mythic',false,
        '{"gates":{"account_age_days":120,"qualified_active_days":80},"metrics":{"seasonal_championship_wins":3,"qualified_battle_wins":1500}}',
        'Rise. Rebuild. Rule.'),

      -- Collection 8: Royal Ascension
      ('royal-ascension',1,'crown-silhouette','Crown Silhouette','rare',false,
        '{"metrics":{"qualified_active_days":150,"qualifying_posts":100,"qualified_battle_wins":25}}',
        'Simple. Regal. Timeless.'),
      ('royal-ascension',2,'amethyst-royale','Amethyst Royale','rare',false,
        '{"metrics":{"qualifying_posts":500,"qualified_content_views":250000,"qualified_votes_received":10000}}',
        'Strength. Luxury. Mystery.'),
      ('royal-ascension',3,'stellar-crown','Stellar Crown','epic',false,
        '{"metrics":{"qualified_content_views":10000000,"qualified_votes_received":1000000,"legitimate_followers":25000}}',
        'Reach beyond. Shine bright.'),
      ('royal-ascension',4,'ocean-majesty','Ocean Majesty','epic',false,
        '{"metrics":{"legitimate_shares":10000,"legitimate_saves":50000}}',
        'Fluid power. Deep impact.'),
      ('royal-ascension',5,'noble-heritage','Noble Heritage','epic',false,
        '{"metrics":{"legitimate_followers":50000,"verified":true,"account_age_days":365}}',
        'Tradition. Honor. Legacy.'),
      ('royal-ascension',6,'enchanted-circlet','Enchanted Circlet','legendary',false,
        '{"metrics":{"qualified_comments_and_reactions":100000,"no_serious_violation":true}}',
        'Mystical power. Untamed spirit.'),
      ('royal-ascension',7,'chrono-commander','Chrono Commander','legendary',false,
        '{"metrics":{"qualified_activity_streak_days":365}}',
        'Time obeys. Lead always.'),
      ('royal-ascension',8,'diamond-ascent','Diamond Ascent','legendary',false,
        '{"metrics":{"qualified_active_days":500,"qualified_content_views":50000000,"qualified_votes_received":2000000}}',
        'Pure focus. Unstoppable rise.'),
      ('royal-ascension',9,'zen-monarch','Zen Monarch','mythic',false,
        '{"metrics":{"account_age_days":730,"qualified_active_days":600,"legitimate_followers":100000,"qualified_votes_received":5000000}}',
        'Inner peace. Outer power.'),

      -- Collection 9: Royal Dominion
      ('royal-dominion',1,'marble-crown','Marble Crown','legendary',false,
        '{"metrics":{"top1_creator_quarters":4}}',
        'Pure. Regal. Unshakable.'),
      ('royal-dominion',2,'void-emperor','Void Emperor','legendary',false,
        '{"metrics":{"global_top100_consecutive_days":90}}',
        'From darkness, dominance.'),
      ('royal-dominion',3,'velvet-dynasty','Velvet Dynasty','legendary',false,
        '{"metrics":{"global_top10_category_seasons":3}}',
        'Elegance in every detail.'),
      ('royal-dominion',4,'neon-sovereign','Neon Sovereign','mythic',false,
        '{"metrics":{"qualified_votes_received":5000000,"qualified_content_views":50000000}}',
        'Modern king. Boundless realm.'),
      ('royal-dominion',5,'shogun-regalia','Shogun Regalia','mythic',false,
        '{"metrics":{"qualified_content_views":100000000,"across_qualifying_posts":100}}',
        'Discipline. Honor. Victory.'),
      ('royal-dominion',6,'frost-citadel','Frost Citadel','mythic',false,
        '{"metrics":{"city_crown_hold_days":365}}',
        'Cold heart. Royal soul.'),
      ('royal-dominion',7,'sea-tyrant','Sea Tyrant','mythic',false,
        '{"metrics":{"state_crown_hold_days":180}}',
        'Conquer oceans. Rule all.'),
      ('royal-dominion',8,'clockwork-crown','Clockwork Crown','mythic',false,
        '{"metrics":{"national_crown_hold_days":90}}',
        'Precision rules. Time obeys.'),
      ('royal-dominion',9,'celestial-reign','Celestial Reign','mythic',false,
        '{"metrics":{"global_crown_hold_days":30,"qualified_votes_received":2000000,"qualified_battle_wins":1000,"qualified_active_days":750}}',
        'Born of stars. Made to reign.')
    ) AS t(col_slug, ord, frame_slug, name, rarity, founder_only, req_json, description)
  LOOP
    SELECT id INTO v_col FROM public.avatar_frame_collections WHERE slug = r.col_slug;

    INSERT INTO public.avatar_frames (
      collection_id, slug, name, description, rarity, display_order,
      asset_status, is_founder_only, ownership_type
    ) VALUES (
      v_col, r.frame_slug, r.name, r.description, r.rarity, r.ord,
      'pending', r.founder_only, 'permanent'
    )
    RETURNING id INTO v_frame_id;

    INSERT INTO public.achievement_definitions (
      slug, name, description, collection_id, avatar_frame_id, rarity,
      achievement_type, is_founder_only, is_active,
      minimum_account_age_days, minimum_qualified_active_days, minimum_distinct_active_weeks,
      requirement_logic,
      checkpoint_rewards,
      display_order
    ) VALUES (
      'ach-' || r.frame_slug,
      r.name,
      r.description,
      v_col,
      v_frame_id,
      r.rarity,
      'frame_unlock',
      r.founder_only,
      true,
      COALESCE( (r.req_json::jsonb #>> '{gates,account_age_days}')::int, 0 ),
      COALESCE( (r.req_json::jsonb #>> '{gates,qualified_active_days}')::int, 0 ),
      COALESCE( (r.req_json::jsonb #>> '{gates,distinct_active_weeks}')::int, 0 ),
      r.req_json::jsonb,
      jsonb_build_array(
        jsonb_build_object('checkpoint', 25, 'reward_type', 'badge'),
        jsonb_build_object('checkpoint', 50, 'reward_type', 'title'),
        jsonb_build_object('checkpoint', 75, 'reward_type', 'frame_preview', 'expires_after_days', 7),
        jsonb_build_object('checkpoint', 100, 'reward_type', 'frame_unlock')
      ),
      r.ord
    );
  END LOOP;
END $$;
