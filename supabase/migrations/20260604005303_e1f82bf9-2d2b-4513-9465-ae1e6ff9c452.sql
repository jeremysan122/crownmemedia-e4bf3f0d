
-- =========================================================================
-- Category system foundation
-- =========================================================================

-- Main category hubs
CREATE TABLE IF NOT EXISTS public.main_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  icon text,
  gradient text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.main_categories TO anon, authenticated;
GRANT ALL ON public.main_categories TO service_role;
ALTER TABLE public.main_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "main_categories_public_read" ON public.main_categories
  FOR SELECT USING (true);
CREATE POLICY "main_categories_admin_write" ON public.main_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Subcategories
CREATE TABLE IF NOT EXISTS public.subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_category_id uuid NOT NULL REFERENCES public.main_categories(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  legacy_enum text, -- maps to old CrownCategory value when applicable
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subcategories_main ON public.subcategories(main_category_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_legacy ON public.subcategories(legacy_enum);

GRANT SELECT ON public.subcategories TO anon, authenticated;
GRANT ALL ON public.subcategories TO service_role;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subcategories_public_read" ON public.subcategories
  FOR SELECT USING (true);
CREATE POLICY "subcategories_admin_write" ON public.subcategories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Tags (normalized)
CREATE TABLE IF NOT EXISTS public.category_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL UNIQUE,
  subcategory_id uuid REFERENCES public.subcategories(id) ON DELETE SET NULL,
  post_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_category_tags_sub ON public.category_tags(subcategory_id);

GRANT SELECT ON public.category_tags TO anon, authenticated;
GRANT ALL ON public.category_tags TO service_role;
ALTER TABLE public.category_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "category_tags_public_read" ON public.category_tags FOR SELECT USING (true);
CREATE POLICY "category_tags_admin_write" ON public.category_tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Category follows (per-user follow / hide)
CREATE TABLE IF NOT EXISTS public.category_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  main_category_id uuid REFERENCES public.main_categories(id) ON DELETE CASCADE,
  subcategory_id uuid REFERENCES public.subcategories(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'following' CHECK (state IN ('following','hidden','favorite')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, main_category_id, subcategory_id, state),
  CHECK (main_category_id IS NOT NULL OR subcategory_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_category_follows_user ON public.category_follows(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_follows TO authenticated;
GRANT ALL ON public.category_follows TO service_role;
ALTER TABLE public.category_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "category_follows_self_read" ON public.category_follows
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "category_follows_self_write" ON public.category_follows
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- User category suggestions
CREATE TABLE IF NOT EXISTS public.category_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_by uuid NOT NULL,
  main_category_id uuid REFERENCES public.main_categories(id) ON DELETE SET NULL,
  proposed_label text NOT NULL,
  proposed_slug text,
  rationale text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','merged')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_category_suggestions_status ON public.category_suggestions(status);

GRANT SELECT, INSERT ON public.category_suggestions TO authenticated;
GRANT ALL ON public.category_suggestions TO service_role;
ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "category_suggestions_self_read" ON public.category_suggestions
  FOR SELECT TO authenticated
  USING (suggested_by = auth.uid()
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "category_suggestions_insert" ON public.category_suggestions
  FOR INSERT TO authenticated WITH CHECK (suggested_by = auth.uid());
CREATE POLICY "category_suggestions_admin_update" ON public.category_suggestions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Add slug columns to posts (legacy `category` enum untouched)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS main_category_slug text,
  ADD COLUMN IF NOT EXISTS subcategory_slug text;

CREATE INDEX IF NOT EXISTS idx_posts_main_cat ON public.posts(main_category_slug) WHERE is_removed = false;
CREATE INDEX IF NOT EXISTS idx_posts_sub_cat ON public.posts(subcategory_slug) WHERE is_removed = false;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_main_categories_touch ON public.main_categories;
CREATE TRIGGER trg_main_categories_touch BEFORE UPDATE ON public.main_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_subcategories_touch ON public.subcategories;
CREATE TRIGGER trg_subcategories_touch BEFORE UPDATE ON public.subcategories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- Seed the 14 main hubs
-- =========================================================================
INSERT INTO public.main_categories (slug, label, description, icon, gradient, sort_order) VALUES
  ('royal-crowns',       'Royal Crowns',            'Overall reigns, rising stars, and platform-wide crowns.', 'Crown',     'from-amber-400 to-yellow-600', 1),
  ('fashion-beauty',     'Fashion & Beauty',        'Style, outfits, glow, hair, makeup, accessories.',         'Sparkles',  'from-fuchsia-500 to-purple-700', 2),
  ('fitness-sports',     'Fitness & Sports',        'Transformations, athletics, gym, performance.',            'Dumbbell',  'from-emerald-500 to-green-700', 3),
  ('relationships-social','Relationships & Social', 'Couples, friendships, social moments.',                    'Heart',     'from-rose-500 to-red-600', 4),
  ('pets-animals',       'Pets & Animals',          'The royal court of pets and wildlife.',                    'PawPrint',  'from-orange-400 to-amber-700', 5),
  ('travel-outdoors',    'Travel & Outdoors',       'Adventures, landscapes, wanderlust.',                      'Plane',     'from-sky-400 to-indigo-600', 6),
  ('cars-auto',          'Cars / Trucks / Auto',    'Exotic, classic, builds, daily drivers.',                  'Car',       'from-zinc-500 to-slate-800', 7),
  ('food-cooking',       'Food & Cooking',          'Plates, recipes, chefs, drinks.',                          'UtensilsCrossed', 'from-orange-500 to-red-600', 8),
  ('home-living',        'Home & Living',           'Interiors, decor, lifestyle.',                             'Home',      'from-stone-400 to-amber-700', 9),
  ('gaming-tech',        'Gaming & Tech',           'Setups, gameplay, gadgets, tech reviews.',                 'Gamepad2',  'from-violet-500 to-indigo-700', 10),
  ('business-hustle',    'Business & Hustle',       'Entrepreneurs, side hustles, wins.',                       'Briefcase', 'from-slate-600 to-stone-900', 11),
  ('creative-talent',    'Creative Talent',         'Art, music, design, performances.',                        'Palette',   'from-violet-500 to-fuchsia-700', 12),
  ('internet-entertainment','Internet & Entertainment','Memes, viral moments, throwbacks, culture.',            'Tv',        'from-pink-400 to-amber-500', 13),
  ('seasonal-events',    'Seasonal & Events',       'Holidays, festivals, celebrations.',                       'PartyPopper','from-red-500 to-amber-500', 14)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- Seed subcategories from existing CrownCategory enum
-- =========================================================================
WITH mapping(legacy, slug, label, main_slug, sort_order) AS (
  VALUES
    -- Royal Crowns
    ('overall',          'overall',          'Overall Crown',     'royal-crowns', 1),
    ('most_popular',     'most-popular',     'Most Popular',      'royal-crowns', 2),
    ('rising_star',      'rising-star',      'Rising Star',       'royal-crowns', 3),
    ('best_confidence',  'best-confidence',  'Best Confidence',   'royal-crowns', 4),
    ('best_aesthetic',   'best-aesthetic',   'Best Aesthetic',    'royal-crowns', 5),
    ('best_vibe',        'best-vibe',        'Best Vibe',         'royal-crowns', 6),
    -- Fashion & Beauty
    ('best_style',       'best-style',       'Best Style',        'fashion-beauty', 1),
    ('best_look',        'best-look',        'Best Look',         'fashion-beauty', 2),
    ('best_outfit',      'best-outfit',      'Best Outfit',       'fashion-beauty', 3),
    ('best_fit',         'best-fit',         'Best Fit',          'fashion-beauty', 4),
    ('best_streetwear',  'best-streetwear',  'Best Streetwear',   'fashion-beauty', 5),
    ('best_formal',      'best-formal',      'Best Formal',       'fashion-beauty', 6),
    ('best_swimwear',    'best-swimwear',    'Best Swimwear',     'fashion-beauty', 7),
    ('best_accessories', 'best-accessories', 'Best Accessories',  'fashion-beauty', 8),
    ('best_shoes',       'best-shoes',       'Best Shoes',        'fashion-beauty', 9),
    ('best_smile',       'best-smile',       'Best Smile',        'fashion-beauty', 10),
    ('best_eyes',        'best-eyes',        'Best Eyes',         'fashion-beauty', 11),
    ('best_hair',        'best-hair',        'Best Hair',         'fashion-beauty', 12),
    ('best_glow',        'best-glow',        'Best Glow',         'fashion-beauty', 13),
    ('best_makeup',      'best-makeup',      'Best Makeup',       'fashion-beauty', 14),
    ('best_pose',        'best-pose',        'Best Pose',         'fashion-beauty', 15),
    ('best_glow_up',     'best-glow-up',     'Best Glow-Up',      'fashion-beauty', 16),
    -- Fitness
    ('best_fitness',     'best-fitness',     'Best Fitness',      'fitness-sports', 1),
    -- Relationships
    ('best_couple',      'best-couple',      'Best Couple',       'relationships-social', 1),
    -- Pets
    ('best_pet',         'best-pet',         'Best Pet',          'pets-animals', 1),
    -- Travel
    ('best_travel',      'best-travel',      'Best Travel',       'travel-outdoors', 1),
    -- Creative
    ('most_creative',    'most-creative',    'Most Creative',     'creative-talent', 1),
    -- Internet & Entertainment
    ('best_throwback',   'best-throwback',   'Best Throwback',    'internet-entertainment', 1)
)
INSERT INTO public.subcategories (main_category_id, slug, label, legacy_enum, sort_order)
SELECT mc.id, m.slug, m.label, m.legacy, m.sort_order
FROM mapping m JOIN public.main_categories mc ON mc.slug = m.main_slug
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- Seed empty starter subs for hubs without legacy mappings (so hubs aren't bare)
-- =========================================================================
WITH starter(main_slug, slug, label, sort_order) AS (
  VALUES
    ('cars-auto',           'best-exotic-car',   'Best Exotic Car', 1),
    ('cars-auto',           'best-truck',        'Best Truck',      2),
    ('cars-auto',           'best-build',        'Best Build',      3),
    ('food-cooking',        'best-plate',        'Best Plate',      1),
    ('food-cooking',        'best-recipe',       'Best Recipe',     2),
    ('food-cooking',        'best-drink',        'Best Drink',      3),
    ('home-living',         'best-interior',     'Best Interior',   1),
    ('home-living',         'best-setup',        'Best Setup',      2),
    ('gaming-tech',         'best-gaming-clip',  'Best Gaming Clip',1),
    ('gaming-tech',         'best-setup',        'Best Gaming Setup',2),
    ('gaming-tech',         'best-tech',         'Best Tech',       3),
    ('business-hustle',     'best-entrepreneur', 'Best Entrepreneur',1),
    ('business-hustle',     'best-hustle',       'Best Side Hustle',2),
    ('creative-talent',     'best-art',          'Best Art',        2),
    ('creative-talent',     'best-music',        'Best Music',      3),
    ('creative-talent',     'best-performance',  'Best Performance',4),
    ('internet-entertainment','best-meme',       'Best Meme',       2),
    ('internet-entertainment','best-viral',      'Best Viral Moment',3),
    ('seasonal-events',     'best-holiday',      'Best Holiday Post',1),
    ('seasonal-events',     'best-festival',     'Best Festival',   2)
)
INSERT INTO public.subcategories (main_category_id, slug, label, sort_order)
SELECT mc.id, s.slug, s.label, s.sort_order
FROM starter s JOIN public.main_categories mc ON mc.slug = s.main_slug
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- Backfill posts.main_category_slug / subcategory_slug from legacy enum
-- =========================================================================
UPDATE public.posts p
SET subcategory_slug = s.slug,
    main_category_slug = mc.slug
FROM public.subcategories s
JOIN public.main_categories mc ON mc.id = s.main_category_id
WHERE s.legacy_enum = p.category::text
  AND (p.subcategory_slug IS NULL OR p.main_category_slug IS NULL);
