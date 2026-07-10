CREATE TABLE public.live_battle_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.live_battles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.live_battle_comments TO authenticated;
GRANT ALL ON public.live_battle_comments TO service_role;

ALTER TABLE public.live_battle_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_battle_comments_read_all_auth"
  ON public.live_battle_comments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "live_battle_comments_insert_self_while_live"
  ON public.live_battle_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.live_battles b
      WHERE b.id = battle_id AND b.status = 'live'
    )
  );

CREATE INDEX live_battle_comments_battle_created_idx
  ON public.live_battle_comments (battle_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_battle_comments;