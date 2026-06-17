-- Root cause: anon/authenticated had table-wide GRANT ALL on public.posts,
-- which overrides the column-level REVOKE the earlier migration tried to
-- apply. In Postgres, column-level grants only restrict access when the
-- broader table-level SELECT is NOT present. So we must:
--   1. Drop the table-wide SELECT (and other privileges on anon).
--   2. Re-grant SELECT only on the safe public columns.
--   3. Keep INSERT/UPDATE/DELETE for authenticated owners (RLS still filters rows).
--   4. service_role keeps everything for backend / publish_post_idempotent.

-- 1. Revoke broad grants on the public client roles.
REVOKE ALL ON public.posts FROM anon;
REVOKE ALL ON public.posts FROM authenticated;

-- 2. Restore the privileges we want, scoped.
--    INSERT / UPDATE / DELETE are table-wide for authenticated; RLS still
--    enforces who may touch which row. anon gets no write access.
GRANT INSERT, UPDATE, DELETE ON public.posts TO authenticated;

-- 3. SELECT is granted only on the safe (public-display) columns.
--    The following columns are intentionally OMITTED for anon + authenticated:
--      - submission_key      (internal idempotency key)
--      - client_request_id   (internal idempotency key)
--      - moderation_notes    (mod-only)
--      - moderated_by        (mod-only)
--      - moderated_at        (mod-only)
GRANT SELECT (
  id, user_id, image_url, caption, category, city, state, country,
  crown_score, vote_count, comment_count, share_count, battle_wins,
  is_removed, created_at, image_urls, media_type, video_url,
  video_poster_url, duration_ms, filter, alt_texts, media_width,
  media_height, photo_filter, video_filter, filter_type, is_archived,
  archived_at, hashtags, edited_at, pinned_at, scheduled_for,
  parent_post_id, repost_caption, tagged_user_ids, media_origin,
  royal_boost_until, vote_boost_until, spotlight_until,
  crown_shield_until, is_sensitive, sensitive_reason, content_rating,
  moderation_status, main_category_slug, subcategory_slug,
  publish_status, content_type
) ON public.posts TO anon, authenticated;

-- 4. Keep service_role at ALL for backend code paths (publish_post_idempotent,
--    moderator tools, edge functions).
GRANT ALL ON public.posts TO service_role;

-- 5. Sanity assertion — fail the migration loudly if the restricted columns
--    are still readable by the public client roles after the changes above.
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.posts', 'submission_key', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'submission_key', 'SELECT')
     OR has_column_privilege('anon', 'public.posts', 'client_request_id', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'client_request_id', 'SELECT')
     OR has_column_privilege('anon', 'public.posts', 'moderation_notes', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'moderation_notes', 'SELECT')
  THEN
    RAISE EXCEPTION 'posts: restricted columns are still readable by anon/authenticated';
  END IF;
END;
$$;