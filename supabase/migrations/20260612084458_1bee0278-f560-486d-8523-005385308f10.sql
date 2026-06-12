-- 1) Add the column with a safe default so existing rows are valid.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'post';

-- 2) Backfill: anything stored as a video is a Scroll under the new model.
--    Image-only posts remain "post". This is the only sane heuristic given the
--    existing schema (no prior content_type signal), and matches what users
--    expect — vertical videos already lived in the Shorts/Scrolls surface.
UPDATE public.posts
SET content_type = 'scroll'
WHERE media_type = 'video' AND content_type = 'post';

-- 3) Constrain allowed values (added AFTER backfill so the migration cannot
--    fail on legacy rows). Drop-if-exists keeps re-runs idempotent.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_content_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_content_type_check
  CHECK (content_type IN ('post','scroll'));

-- 4) Index profile/feed lookups by (user, type, recency). Profile tabs
--    query "this user's posts" or "this user's scrolls" ordered newest-first;
--    this index serves both directly.
CREATE INDEX IF NOT EXISTS posts_user_content_type_created_idx
  ON public.posts (user_id, content_type, created_at DESC);

-- 5) Index feed/scrolls global lookups by (type, recency) so the public
--    Feed (content_type='post') and Scrolls (content_type='scroll') surfaces
--    do not have to scan the whole posts table.
CREATE INDEX IF NOT EXISTS posts_content_type_created_idx
  ON public.posts (content_type, created_at DESC);