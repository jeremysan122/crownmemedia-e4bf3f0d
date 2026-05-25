CREATE TABLE public.comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX idx_comment_reactions_comment ON public.comment_reactions(comment_id);

ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_reactions viewable by everyone"
ON public.comment_reactions FOR SELECT
USING (true);

CREATE POLICY "users add own comment reactions"
ON public.comment_reactions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users remove own comment reactions"
ON public.comment_reactions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);