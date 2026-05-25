-- Defense-in-depth: explicitly revoke PII columns from anon on public.profiles
-- so an accidental future GRANT or schema reset cannot expose them, even though
-- the RLS SELECT policy is permissive.
REVOKE SELECT (first_name, last_name, gender, banner_url, banner_position_y,
               avatar_position_y, liked_posts_public, is_private, hide_likes,
               hide_comments, hide_views, posts_visibility, deactivated_at,
               deletion_requested_at, links, locale, default_post_visibility,
               default_category, default_comments_enabled, watermark_enabled,
               autosave_to_camera_roll, who_can_tag, who_can_mention, who_can_dm,
               tag_review_required, reduce_motion, larger_text, high_contrast,
               captions_default_on, autoplay_cellular, quiet_hours_start,
               quiet_hours_end, timezone, push_likes, push_follows, push_comments,
               push_battles, default_battle_stake, auto_accept_battles_from_follows,
               default_race_scope, banned_at, banned_by, banned_reason)
ON public.profiles FROM anon;

-- Re-affirm non-PII columns are readable by anon (idempotent).
GRANT SELECT (id, username, profile_photo_url, bio, city, state, country,
              followers_count, following_count, votes_received, votes_given,
              crowns_held, crowns_total, battle_wins, is_suspended, is_banned,
              created_at, updated_at)
ON public.profiles TO anon;