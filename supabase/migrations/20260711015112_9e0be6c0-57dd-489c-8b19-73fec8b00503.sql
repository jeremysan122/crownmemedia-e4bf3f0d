
-- 1) Restore grants on public.posts (public-readable content).
GRANT SELECT ON public.posts TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

-- 2) Add missing FKs from gift_transactions -> profiles so PostgREST can embed profile info.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gift_transactions_sender_id_fkey') THEN
    ALTER TABLE public.gift_transactions
      ADD CONSTRAINT gift_transactions_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gift_transactions_receiver_id_fkey') THEN
    ALTER TABLE public.gift_transactions
      ADD CONSTRAINT gift_transactions_receiver_id_fkey
      FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';

-- 3) Relax analytics_events name check; keep a sanity length cap.
ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_event_name_valid;
ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_name_check;
ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_event_name_length
  CHECK (char_length(event_name) BETWEEN 1 AND 80);
