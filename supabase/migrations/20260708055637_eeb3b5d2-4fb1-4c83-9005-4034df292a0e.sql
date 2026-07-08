-- Allow post deletion without cascading into battles (which are immutable history).
-- The battles table has a BEFORE DELETE trigger that raises an exception,
-- which was firing when a post referenced by a battle was deleted (CASCADE).
-- Switch to SET NULL so the battle history row survives with a null post ref.

ALTER TABLE public.battles ALTER COLUMN challenger_post_id DROP NOT NULL;
ALTER TABLE public.battles ALTER COLUMN opponent_post_id DROP NOT NULL;

ALTER TABLE public.battles DROP CONSTRAINT IF EXISTS battles_challenger_post_id_fkey;
ALTER TABLE public.battles DROP CONSTRAINT IF EXISTS battles_opponent_post_id_fkey;

ALTER TABLE public.battles
  ADD CONSTRAINT battles_challenger_post_id_fkey
  FOREIGN KEY (challenger_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

ALTER TABLE public.battles
  ADD CONSTRAINT battles_opponent_post_id_fkey
  FOREIGN KEY (opponent_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;