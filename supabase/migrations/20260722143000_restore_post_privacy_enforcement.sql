-- =========================================================================
-- Restore server-side account-privacy enforcement on posts.
--
-- The 2026-06-11 policy rewrite replaced "Posts viewable per privacy"
-- (which called can_view_posts_of) with posts_public_read_approved, which
-- only checked removed/archived/approved. Net effect: posts from private
-- and followers-only accounts were readable by anyone, including anonymous
-- callers — the privacy settings in the app were client-side only.
--
-- can_view_posts_of(owner) already implements the expected social-platform
-- model (matches Instagram-style behavior):
--   * owner and admins/moderators always see the posts
--   * deactivated accounts' posts are hidden
--   * public accounts       → visible to everyone (incl. signed-out)
--   * followers-only        → visible only to signed-in followers
--   * private               → visible only to signed-in followers
-- Fold it back into the public-read policy. Owner/admin access stays in
-- their dedicated permissive policies.
-- =========================================================================

DROP POLICY IF EXISTS "posts_public_read_approved" ON public.posts;
CREATE POLICY "posts_public_read_approved"
  ON public.posts FOR SELECT
  USING (
    is_removed = false
    AND is_archived = false
    AND publish_status = 'approved'
    AND (scheduled_for IS NULL OR scheduled_for <= now())
    AND public.can_view_posts_of(user_id)
  );

-- RLS policies execute functions as the calling role. A prior lint
-- remediation revoked broad EXECUTE grants on SECURITY DEFINER functions,
-- which included this policy helper — without these grants every post read
-- fails with "permission denied for function can_view_posts_of".
GRANT EXECUTE ON FUNCTION public.can_view_posts_of(uuid) TO anon, authenticated;
