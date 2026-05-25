ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS sound_enabled boolean NOT NULL DEFAULT true;