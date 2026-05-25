
-- Profile preference columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS default_post_visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS default_category text,
  ADD COLUMN IF NOT EXISTS default_comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS watermark_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autosave_to_camera_roll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS who_can_tag text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS who_can_mention text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS who_can_dm text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS tag_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reduce_motion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS larger_text boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS high_contrast boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS captions_default_on boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS autoplay_cellular boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_start time,
  ADD COLUMN IF NOT EXISTS quiet_hours_end time,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS push_likes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_follows boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_comments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_battles boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_battle_stake integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_accept_battles_from_follows boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_race_scope text NOT NULL DEFAULT 'global';

-- Constrain enum-like columns via validation trigger (avoids immutable-check pitfalls)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_visibility_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_visibility_chk
      CHECK (default_post_visibility IN ('public','followers','private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_who_tag_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_who_tag_chk
      CHECK (who_can_tag IN ('everyone','followers','nobody'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_who_mention_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_who_mention_chk
      CHECK (who_can_mention IN ('everyone','followers','nobody'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_who_dm_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_who_dm_chk
      CHECK (who_can_dm IN ('everyone','followers','nobody'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_race_scope_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_race_scope_chk
      CHECK (default_race_scope IN ('global','country','city'));
  END IF;
END $$;

-- muted_words
CREATE TABLE IF NOT EXISTS public.muted_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  word text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);
ALTER TABLE public.muted_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own muted words" ON public.muted_words;
CREATE POLICY "Users view own muted words" ON public.muted_words
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own muted words" ON public.muted_words;
CREATE POLICY "Users insert own muted words" ON public.muted_words
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own muted words" ON public.muted_words;
CREATE POLICY "Users delete own muted words" ON public.muted_words
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_muted_words_user ON public.muted_words(user_id);

-- restricted_users
CREATE TABLE IF NOT EXISTS public.restricted_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_user_id),
  CHECK (user_id <> target_user_id)
);
ALTER TABLE public.restricted_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own restricted" ON public.restricted_users;
CREATE POLICY "Users view own restricted" ON public.restricted_users
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own restricted" ON public.restricted_users;
CREATE POLICY "Users insert own restricted" ON public.restricted_users
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own restricted" ON public.restricted_users;
CREATE POLICY "Users delete own restricted" ON public.restricted_users
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_restricted_users_user ON public.restricted_users(user_id);
