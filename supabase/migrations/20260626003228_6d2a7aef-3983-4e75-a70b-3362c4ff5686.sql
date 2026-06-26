
-- 1) share_cards: allow anon SELECT for public-safe targets (mirrors authenticated)
DROP POLICY IF EXISTS "share_cards readable anon public-safe" ON public.share_cards;
CREATE POLICY "share_cards readable anon public-safe"
  ON public.share_cards FOR SELECT TO anon
  USING (
    invalidated_at IS NULL
    AND is_sensitive_safe = true
    AND (
      target_type <> 'post'
      OR EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = share_cards.target_id
          AND p.is_removed = false
          AND COALESCE(p.is_sensitive, false) = false
          AND p.moderation_status = 'approved'
      )
    )
  );
GRANT SELECT ON public.share_cards TO anon;

-- 2) post_media: allow anon SELECT for non-deleted media on visible posts
DROP POLICY IF EXISTS "post_media readable anon for public posts" ON public.post_media;
CREATE POLICY "post_media readable anon for public posts"
  ON public.post_media FOR SELECT TO anon
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media.post_id
        AND p.is_removed = false
        AND p.moderation_status = 'approved'
        AND COALESCE(p.is_sensitive, false) = false
    )
  );
GRANT SELECT ON public.post_media TO anon;

-- 3) Hide Stripe price IDs from regular authenticated users (defense-in-depth)
REVOKE SELECT (stripe_price_id) ON public.boost_bundles FROM authenticated;
REVOKE SELECT (stripe_price_id) ON public.royal_pass_plans FROM authenticated;
REVOKE SELECT (stripe_price_id) ON public.shekel_bundles FROM authenticated;
-- service_role keeps full access for checkout edge functions.
