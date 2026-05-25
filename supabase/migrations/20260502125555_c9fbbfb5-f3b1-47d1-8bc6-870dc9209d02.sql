-- 1) Guard posts: prevent users from changing protected/computed columns directly
CREATE OR REPLACE FUNCTION public.posts_guard_owner_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Allow service role (no auth.uid()) and admins/moderators to update anything
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.crown_score IS DISTINCT FROM OLD.crown_score
     OR NEW.vote_count IS DISTINCT FROM OLD.vote_count
     OR NEW.comment_count IS DISTINCT FROM OLD.comment_count
     OR NEW.share_count IS DISTINCT FROM OLD.share_count
     OR NEW.battle_wins IS DISTINCT FROM OLD.battle_wins
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Users cannot modify protected post fields (score/vote/comment/share/battle counts)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_guard_owner_updates_trg ON public.posts;
CREATE TRIGGER posts_guard_owner_updates_trg
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_guard_owner_updates();

-- 2) Server-side comment rate limiting (5 per 30s, min 2s gap)
CREATE OR REPLACE FUNCTION public.comments_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recent int;
  v_last timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT count(*), max(created_at)
    INTO v_recent, v_last
    FROM public.comments
    WHERE user_id = auth.uid()
      AND created_at > now() - interval '30 seconds';

  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'Comment rate limit exceeded — please slow down';
  END IF;
  IF v_last IS NOT NULL AND v_last > now() - interval '2 seconds' THEN
    RAISE EXCEPTION 'You are commenting too fast — wait a moment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_rate_limit_trg ON public.comments;
CREATE TRIGGER comments_rate_limit_trg
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.comments_rate_limit();

-- 3) Tighten battles UPDATE policy: require participant on both USING and WITH CHECK
--    (existing trigger battles_guard_participant_updates already blocks protected columns;
--     this hardens the policy and makes intent explicit)
DROP POLICY IF EXISTS "Participants can update battle limited" ON public.battles;
CREATE POLICY "Participants can update battle limited"
ON public.battles
FOR UPDATE
TO authenticated
USING (auth.uid() = challenger_id OR auth.uid() = opponent_id)
WITH CHECK (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- 4) Storage: align posts bucket delete/update policies with path-prefix ownership
DROP POLICY IF EXISTS "Owner delete posts" ON storage.objects;
DROP POLICY IF EXISTS "Owner update posts" ON storage.objects;

CREATE POLICY "Owner delete posts"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owner update posts"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
