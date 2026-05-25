-- Privacy fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_likes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_comments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_views boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posts_visibility text NOT NULL DEFAULT 'public';

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_posts_visibility_check
      CHECK (posts_visibility IN ('public','followers','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: can the current viewer see _owner's posts?
CREATE OR REPLACE FUNCTION public.can_view_posts_of(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() = _owner THEN true
      WHEN auth.uid() IS NOT NULL AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'moderator'::app_role)
      ) THEN true
      ELSE EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _owner
          AND p.posts_visibility = 'public'
          AND p.is_private = false
      ) OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = _owner
            AND p.posts_visibility <> 'private'
            AND (p.posts_visibility = 'followers' OR p.is_private = true)
        )
        AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE f.following_id = _owner AND f.follower_id = auth.uid()
        )
      )
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_posts_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_posts_of(uuid) TO anon, authenticated;

-- Replace the posts SELECT policy with a privacy-aware version
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
CREATE POLICY "Posts viewable per privacy"
ON public.posts
FOR SELECT
USING (
  ( is_removed = false AND public.can_view_posts_of(user_id) )
  OR auth.uid() = user_id
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Helper: do post-owner comment settings allow this commenter?
CREATE OR REPLACE FUNCTION public.comments_allowed_on(_post uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.posts po
    JOIN public.profiles pr ON pr.id = po.user_id
    WHERE po.id = _post
      AND pr.hide_comments = true
      AND (auth.uid() IS NULL OR auth.uid() <> po.user_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.comments_allowed_on(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comments_allowed_on(uuid) TO authenticated;

-- Restrictive policy: enforce hide_comments on inserts (admins/mods bypass)
DROP POLICY IF EXISTS "comments respect hide_comments" ON public.comments;
CREATE POLICY "comments respect hide_comments"
ON public.comments
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.comments_allowed_on(post_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);
