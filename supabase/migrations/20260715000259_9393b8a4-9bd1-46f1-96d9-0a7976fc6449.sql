
-- ============================================================
-- Wave 2: Achievement Crowns schema
-- ============================================================

-- 1. Catalog: achievement_crowns
CREATE TABLE public.achievement_crowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  collection_slug text NOT NULL,
  collection_name text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common','uncommon','rare','epic','legendary','mythic')),
  tier_index int NOT NULL,
  asset_url text NOT NULL,
  description text NOT NULL DEFAULT '',
  lore text NOT NULL DEFAULT '',
  unlock_hint text NOT NULL DEFAULT '',
  requirement_logic jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_secret boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.achievement_crowns TO anon, authenticated;
GRANT ALL ON public.achievement_crowns TO service_role;

ALTER TABLE public.achievement_crowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crown catalog is public-readable when active"
  ON public.achievement_crowns FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage crown catalog"
  ON public.achievement_crowns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_achievement_crowns_collection ON public.achievement_crowns(collection_slug, sort_order);
CREATE INDEX idx_achievement_crowns_rarity ON public.achievement_crowns(rarity);

-- 2. Ownership: user_achievement_crowns
CREATE TABLE public.user_achievement_crowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crown_id uuid NOT NULL REFERENCES public.achievement_crowns(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'achievement',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, crown_id)
);

GRANT SELECT ON public.user_achievement_crowns TO authenticated;
GRANT ALL ON public.user_achievement_crowns TO service_role;

ALTER TABLE public.user_achievement_crowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own unlocks; admins read all"
  ON public.user_achievement_crowns FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage unlocks"
  ON public.user_achievement_crowns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_achievement_crowns_user ON public.user_achievement_crowns(user_id, unlocked_at DESC);
CREATE INDEX idx_user_achievement_crowns_crown ON public.user_achievement_crowns(crown_id);

-- 3. Progress: user_crown_progress
CREATE TABLE public.user_crown_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crown_id uuid NOT NULL REFERENCES public.achievement_crowns(id) ON DELETE CASCADE,
  progress numeric NOT NULL DEFAULT 0,
  target numeric NOT NULL DEFAULT 1,
  completion_percent numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, crown_id)
);

GRANT SELECT ON public.user_crown_progress TO authenticated;
GRANT ALL ON public.user_crown_progress TO service_role;

ALTER TABLE public.user_crown_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own crown progress; admins read all"
  ON public.user_crown_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage crown progress"
  ON public.user_crown_progress FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_crown_progress_user ON public.user_crown_progress(user_id);
CREATE INDEX idx_user_crown_progress_crown ON public.user_crown_progress(crown_id);

-- 4. Equipped crown on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_achievement_crown_id uuid
    REFERENCES public.achievement_crowns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_equipped_crown ON public.profiles(equipped_achievement_crown_id);

-- 5. updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_achievement_crowns_updated
  BEFORE UPDATE ON public.achievement_crowns
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TRIGGER trg_user_crown_progress_updated
  BEFORE UPDATE ON public.user_crown_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
