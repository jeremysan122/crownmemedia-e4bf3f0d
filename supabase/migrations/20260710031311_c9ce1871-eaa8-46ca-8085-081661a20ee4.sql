UPDATE public.feature_flags
SET enabled = true, rollout_percent = 100, audience = 'all', updated_at = now()
WHERE key = 'live_battles_enabled';