-- 1. Add 'dislike' to vote_type enum
ALTER TYPE public.vote_type ADD VALUE IF NOT EXISTS 'dislike';

-- 2. Insert 10 flower + 10 oil micro-gifts (10..100 shekels, all 'low' tier)
INSERT INTO public.gifts (id, name, shekel_cost, tier, rarity, animation_type, icon, trending, top_pick, visibility_boost, active)
VALUES
  ('flower_daisy',     'Daisy',       10, 'low', 'common', 'flower_daisy',     '🌼', false, false, false, true),
  ('flower_lily',      'Lily',        20, 'low', 'common', 'flower_lily',      '🌸', false, false, false, true),
  ('flower_tulip',     'Tulip',       30, 'low', 'common', 'flower_tulip',     '🌷', false, false, false, true),
  ('flower_rose_mini', 'Mini Rose',   40, 'low', 'common', 'flower_rose_mini', '🌹', true,  false, false, true),
  ('flower_sunflower', 'Sunflower',   50, 'low', 'common', 'flower_sunflower', '🌻', false, true,  false, true),
  ('flower_orchid',    'Orchid',      60, 'low', 'common', 'flower_orchid',    '🌺', false, false, false, true),
  ('flower_jasmine',   'Jasmine',     70, 'low', 'common', 'flower_jasmine',   '💮', false, false, false, true),
  ('flower_violet',    'Violet',      80, 'low', 'common', 'flower_violet',    '🪻', false, false, false, true),
  ('flower_peony',     'Peony',       90, 'low', 'common', 'flower_peony',     '🌸', false, false, false, true),
  ('flower_bouquet',   'Bouquet',    100, 'low', 'common', 'flower_bouquet',   '💐', true,  false, false, true),

  ('oil_lavender',     'Lavender Oil',     10, 'low', 'common', 'oil_lavender',     '🫧', false, false, false, true),
  ('oil_rose',         'Rose Oil',         20, 'low', 'common', 'oil_rose',         '🌹', false, false, false, true),
  ('oil_mint',         'Mint Oil',         30, 'low', 'common', 'oil_mint',         '🌿', false, false, false, true),
  ('oil_eucalyptus',   'Eucalyptus Oil',   40, 'low', 'common', 'oil_eucalyptus',   '🌱', false, false, false, true),
  ('oil_jasmine',      'Jasmine Oil',      50, 'low', 'common', 'oil_jasmine',      '🪷', false, false, false, true),
  ('oil_sandalwood',   'Sandalwood Oil',   60, 'low', 'common', 'oil_sandalwood',   '🪵', false, true,  false, true),
  ('oil_amber',        'Amber Oil',        70, 'low', 'common', 'oil_amber',        '🟠', false, false, false, true),
  ('oil_frankincense', 'Frankincense Oil', 80, 'low', 'common', 'oil_frankincense', '🕯️', false, false, false, true),
  ('oil_myrrh',        'Myrrh Oil',        90, 'low', 'common', 'oil_myrrh',        '🫗', false, false, false, true),
  ('oil_anointing',    'Anointing Oil',   100, 'low', 'common', 'oil_anointing',    '✨', true,  false, false, true)
ON CONFLICT (id) DO NOTHING;