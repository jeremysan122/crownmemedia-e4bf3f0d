
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_event_name_valid;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_event_name_valid
  CHECK (event_name IN (
    'vote_cast','vote_removed',
    'comment_posted','comment_fired','comment_fire_removed',
    'post_shared','post_viewed','post_edited','post_deleted',
    'post_reposted','post_tagged_people','post_scheduled',
    'user_blocked','user_reported',
    'age_gate_viewed','age_gate_confirmed','age_gate_blocked_underage',
    'age_gate_checkbox_toggled','age_reverify_required'
  ));
