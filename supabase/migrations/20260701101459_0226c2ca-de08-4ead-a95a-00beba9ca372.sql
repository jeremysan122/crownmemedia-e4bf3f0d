-- Grant SELECT on posts.aspect_ratio to anon and authenticated so the Feed
-- (which selects aspect_ratio via POST_SELECT / PARENT_SELECT) stops hitting
-- "permission denied for table posts". Column-level grants are used because
-- public.posts has column-scoped SELECT grants instead of a table-wide grant.
GRANT SELECT (aspect_ratio) ON public.posts TO anon, authenticated;

DO $$
BEGIN
  IF NOT has_column_privilege('anon', 'public.posts', 'aspect_ratio', 'SELECT') THEN
    RAISE EXCEPTION 'anon cannot read posts.aspect_ratio';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.posts', 'aspect_ratio', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot read posts.aspect_ratio';
  END IF;

  IF has_column_privilege('anon', 'public.posts', 'submission_key', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'submission_key', 'SELECT')
     OR has_column_privilege('anon', 'public.posts', 'client_request_id', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'client_request_id', 'SELECT')
     OR has_column_privilege('anon', 'public.posts', 'moderation_notes', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'moderation_notes', 'SELECT')
  THEN
    RAISE EXCEPTION 'restricted posts columns became readable unexpectedly';
  END IF;
END;
$$;