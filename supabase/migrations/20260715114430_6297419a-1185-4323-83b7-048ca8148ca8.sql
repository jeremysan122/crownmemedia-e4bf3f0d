-- Wave 3: seed the achievement crown feature flag (default enabled, 100% rollout).
INSERT INTO public.feature_flags (key, enabled, rollout_percent, audience, description)
VALUES (
  'achievement_crowns_enabled',
  true,
  100,
  'all',
  'Master toggle for the 100-crown Achievement Crown gallery, share pages, and unlock evaluator. Flip off to temporarily hide the system without a redeploy.'
)
ON CONFLICT (key) DO NOTHING;