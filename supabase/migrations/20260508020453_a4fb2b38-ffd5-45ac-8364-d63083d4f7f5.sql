ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_position_y smallint NOT NULL DEFAULT 50;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_banner_position_y_chk CHECK (banner_position_y BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

ALTER TABLE public.posts REPLICA IDENTITY FULL;
ALTER TABLE public.follows REPLICA IDENTITY FULL;