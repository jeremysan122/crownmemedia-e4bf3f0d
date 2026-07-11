
-- ============================================================
-- QA hardening: restore posts column-level lockdown + FK safety +
-- profile.crown_score self-edit guard.
-- ============================================================

-- 1) Restore posts column-level SELECT allowlist (my earlier fix broadly
--    re-granted table SELECT, exposing internal columns). Also restore
--    the column-level UPDATE allowlist (owner-safe columns; admin/mod
--    fields go through SECURITY DEFINER RPCs).
REVOKE SELECT ON public.posts FROM anon, authenticated;
REVOKE UPDATE ON public.posts FROM anon, authenticated;

GRANT SELECT (
  id, user_id, image_url, image_urls,
  caption, category, main_category_slug, subcategory_slug, hashtags,
  city, state, country,
  crown_score, vote_count, comment_count, share_count, repost_count, battle_wins,
  created_at, edited_at, pinned_at, scheduled_for,
  parent_post_id, repost_caption, tagged_user_ids,
  media_type, video_url, video_poster_url, video_filter, photo_filter,
  filter, filter_type, duration_ms, alt_texts, aspect_ratio,
  media_width, media_height, media_origin,
  is_sensitive, content_type, content_rating,
  is_removed, is_archived, archived_at,
  moderation_status, publish_status,
  crown_shield_until, royal_boost_until, spotlight_until, vote_boost_until,
  location_enabled, location_source, location_label,
  region_name, region_type, post_lat, post_lng,
  post_location_precision, location_captured_at
) ON public.posts TO anon, authenticated;

GRANT UPDATE (
  caption, hashtags, alt_texts,
  filter, photo_filter, video_filter, filter_type,
  location_enabled, location_source, location_label,
  city, state, country, region_name, region_type,
  post_lat, post_lng, post_location_precision, location_captured_at,
  edited_at, is_archived, archived_at, pinned_at, repost_caption
) ON public.posts TO authenticated;

-- INSERT/DELETE stay table-wide (RLS + triggers gate them).
GRANT INSERT, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

-- Sanity: internal columns must not be readable/writable by public roles.
DO $$
BEGIN
  IF has_column_privilege('anon',         'public.posts', 'submission_key',   'SELECT')
  OR has_column_privilege('authenticated','public.posts', 'submission_key',   'SELECT')
  OR has_column_privilege('anon',         'public.posts', 'client_request_id','SELECT')
  OR has_column_privilege('authenticated','public.posts', 'client_request_id','SELECT')
  OR has_column_privilege('anon',         'public.posts', 'moderation_notes', 'SELECT')
  OR has_column_privilege('authenticated','public.posts', 'moderation_notes', 'SELECT')
  OR has_column_privilege('authenticated','public.posts', 'moderated_by',     'SELECT')
  OR has_column_privilege('authenticated','public.posts', 'moderated_at',     'SELECT')
  OR has_column_privilege('authenticated','public.posts', 'sensitive_reason', 'SELECT')
  OR has_column_privilege('authenticated','public.posts', 'crown_score',      'UPDATE')
  OR has_column_privilege('authenticated','public.posts', 'is_sensitive',     'UPDATE')
  OR has_column_privilege('authenticated','public.posts', 'moderation_status','UPDATE')
  OR has_column_privilege('authenticated','public.posts', 'publish_status',   'UPDATE')
  OR has_column_privilege('authenticated','public.posts', 'user_id',          'UPDATE')
  THEN
    RAISE EXCEPTION 'posts: internal columns still readable/writable by public roles';
  END IF;
END $$;

-- 2) gift_transactions: financial history must NOT vanish on profile delete.
ALTER TABLE public.gift_transactions
  DROP CONSTRAINT IF EXISTS gift_transactions_sender_id_fkey,
  DROP CONSTRAINT IF EXISTS gift_transactions_receiver_id_fkey;
ALTER TABLE public.gift_transactions
  ADD CONSTRAINT gift_transactions_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT gift_transactions_receiver_id_fkey
    FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- 3) profiles.crown_score is server-owned. Block non-admin self-edits.
CREATE OR REPLACE FUNCTION public.guard_profiles_crown_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.crown_score IS DISTINCT FROM OLD.crown_score THEN
    IF NOT (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'moderator'::app_role)
    ) THEN
      -- Silently restore instead of erroring, so posts trigger and admin
      -- RPCs (which run under definer / service_role, bypassing this check
      -- via a different session role) remain unaffected.
      NEW.crown_score := OLD.crown_score;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_crown_score ON public.profiles;
CREATE TRIGGER trg_guard_profiles_crown_score
BEFORE UPDATE OF crown_score ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_crown_score();

NOTIFY pgrst, 'reload schema';
