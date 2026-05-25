
-- 1. Avatar reframe position (0-100, default centered)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_position_y smallint NOT NULL DEFAULT 50;

-- 2. Liked-posts privacy preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS liked_posts_public boolean NOT NULL DEFAULT true;

-- 3. Case-insensitive username uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username));

-- 4. Allow notification owners to delete their own notifications
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Allow message participants to delete their own copy
DROP POLICY IF EXISTS "Users delete own messages" ON public.messages;
CREATE POLICY "Users delete own messages"
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
