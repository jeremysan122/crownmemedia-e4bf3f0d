
-- Trending posts: keyset cursor (crown_score DESC, id ASC) on visible posts only.
CREATE INDEX IF NOT EXISTS idx_posts_discover_trending
  ON public.posts (crown_score DESC, id ASC)
  WHERE is_removed = false AND is_archived = false;

-- Recent-window filter helper for Discover (created_at gte ...).
CREATE INDEX IF NOT EXISTS idx_posts_discover_recent
  ON public.posts (created_at DESC)
  WHERE is_removed = false AND is_archived = false;

-- Posts by main_category for hub stats.
CREATE INDEX IF NOT EXISTS idx_posts_main_category_recent
  ON public.posts (main_category_slug, created_at DESC)
  WHERE is_removed = false;

-- Live battles cursor: (ends_at ASC, id ASC) scoped to active/pending only.
CREATE INDEX IF NOT EXISTS idx_battles_discover_active
  ON public.battles (ends_at ASC, id ASC)
  WHERE status IN ('active','pending');

-- People Near You: country + score on visible profiles.
CREATE INDEX IF NOT EXISTS idx_profiles_discover_country
  ON public.profiles (country, votes_received DESC)
  WHERE is_banned = false AND is_suspended = false AND is_private = false AND username IS NOT NULL;

-- City/state fallback ordering on visible profiles.
CREATE INDEX IF NOT EXISTS idx_profiles_discover_city
  ON public.profiles (city, votes_received DESC)
  WHERE is_banned = false AND is_suspended = false AND is_private = false;

CREATE INDEX IF NOT EXISTS idx_profiles_discover_state
  ON public.profiles (state, votes_received DESC)
  WHERE is_banned = false AND is_suspended = false AND is_private = false;

-- Suggested creators (global by score) — visible profiles only.
CREATE INDEX IF NOT EXISTS idx_profiles_discover_score
  ON public.profiles (votes_received DESC)
  WHERE is_banned = false AND is_suspended = false AND is_private = false AND username IS NOT NULL;

-- Blocks lookup for the viewer.
CREATE INDEX IF NOT EXISTS idx_blocks_blocker
  ON public.blocks (blocker_id, blocked_id);
