
-- 1. Column-level SELECT lockdown on sensitive/internal posts columns.
-- Owner/admin still see them via SECURITY DEFINER RPCs; service_role keeps full access.
REVOKE SELECT (post_lat, post_lng, location_captured_at,
               ai_searchable_text, ai_suggested_main_category_slug)
  ON public.posts FROM anon, authenticated, PUBLIC;

-- 2. Safe global-search RPC. Uses ai_searchable_text (OCR + AI topic) internally
--    but returns only the public post DTO — no AI/internal fields leak.
CREATE OR REPLACE FUNCTION public.search_public_posts(
  _query  text,
  _limit  integer DEFAULT 12,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id                  uuid,
  user_id             uuid,
  image_url           text,
  image_urls          text[],
  video_poster_url    text,
  media_type          text,
  content_type        text,
  caption             text,
  category            text,
  main_category_slug  text,
  subcategory_slug    text,
  city                text,
  state               text,
  country             text,
  crown_score         numeric,
  vote_count          integer,
  comment_count       integer,
  repost_count        integer,
  created_at          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (SELECT lower(coalesce(_query, '')) AS term)
  SELECT
    p.id, p.user_id, p.image_url, p.image_urls, p.video_poster_url,
    p.media_type, p.content_type, p.caption, p.category,
    p.main_category_slug, p.subcategory_slug,
    p.city, p.state, p.country,
    p.crown_score, p.vote_count, p.comment_count, p.repost_count,
    p.created_at
  FROM public.posts p, q
  WHERE p.is_removed = false
    AND coalesce(p.publish_status, 'approved') = 'approved'
    AND (
      length(q.term) < 2
      OR p.caption ILIKE '%' || q.term || '%'
      OR p.city    ILIKE '%' || q.term || '%'
      OR p.country ILIKE '%' || q.term || '%'
      OR p.ai_searchable_text ILIKE '%' || q.term || '%'
    )
  ORDER BY p.crown_score DESC NULLS LAST, p.created_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 12), 50))
  OFFSET greatest(0, coalesce(_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.search_public_posts(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_posts(text, integer, integer) TO authenticated, service_role;
