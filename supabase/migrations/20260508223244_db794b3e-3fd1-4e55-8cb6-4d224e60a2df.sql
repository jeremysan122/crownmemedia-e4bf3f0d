CREATE TABLE IF NOT EXISTS public.pinned_dm_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  other_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, other_user_id)
);

ALTER TABLE public.pinned_dm_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads pinned dm" ON public.pinned_dm_threads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner inserts pinned dm" ON public.pinned_dm_threads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes pinned dm" ON public.pinned_dm_threads
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS pinned_dm_threads_user_idx ON public.pinned_dm_threads (user_id);