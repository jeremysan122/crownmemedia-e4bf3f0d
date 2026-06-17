CREATE OR REPLACE FUNCTION public.send_dm_share(
  p_recipient_id uuid,
  p_kind text,
  p_post_id uuid DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_dedupe_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_msg_id uuid;
  v_can_dm boolean;
  v_recipient_ok boolean;
  v_post_ok boolean;
  v_profile_ok boolean;
  v_sender_username text;
  v_body text;
  v_existing_id uuid;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_recipient_id IS NULL OR p_recipient_id = v_sender THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  IF p_kind NOT IN ('post_share','profile_share') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF p_kind = 'post_share' AND p_post_id IS NULL THEN RAISE EXCEPTION 'Missing post id'; END IF;
  IF p_kind = 'profile_share' AND p_profile_id IS NULL THEN RAISE EXCEPTION 'Missing profile id'; END IF;

  SELECT NOT COALESCE(is_banned, false) AND NOT COALESCE(is_suspended, false)
    INTO v_recipient_ok FROM public.profiles WHERE id = p_recipient_id;
  IF NOT COALESCE(v_recipient_ok, false) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.blocks
     WHERE (blocker_id = v_sender AND blocked_id = p_recipient_id)
        OR (blocker_id = p_recipient_id AND blocked_id = v_sender)
  ) INTO v_can_dm;
  IF NOT v_can_dm THEN RAISE EXCEPTION 'Cannot send to this recipient'; END IF;

  IF p_kind = 'post_share' THEN
    SELECT NOT COALESCE(is_removed, false)
       AND NOT COALESCE(is_archived, false)
       AND COALESCE(moderation_status::text, 'approved') NOT IN ('removed','flagged')
      INTO v_post_ok FROM public.posts WHERE id = p_post_id;
    IF NOT COALESCE(v_post_ok, false) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  END IF;

  IF p_kind = 'profile_share' THEN
    SELECT NOT COALESCE(is_banned, false) AND NOT COALESCE(is_suspended, false)
      INTO v_profile_ok FROM public.profiles WHERE id = p_profile_id;
    IF NOT COALESCE(v_profile_ok, false) THEN RAISE EXCEPTION 'Profile unavailable'; END IF;
  END IF;

  SELECT id INTO v_existing_id FROM public.messages
   WHERE sender_id = v_sender AND receiver_id = p_recipient_id AND kind = p_kind
     AND ((p_kind = 'post_share' AND shared_post_id = p_post_id)
       OR (p_kind = 'profile_share' AND shared_profile_id = p_profile_id))
     AND created_at >= now() - interval '30 seconds'
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message_id', v_existing_id, 'deduped', true);
  END IF;

  v_body := COALESCE(NULLIF(trim(p_body), ''),
              CASE WHEN p_kind = 'post_share' THEN '↗ Shared a post' ELSE '↗ Shared a profile' END);

  INSERT INTO public.messages (sender_id, receiver_id, body, kind, shared_post_id, shared_profile_id, delivered_at)
  VALUES (v_sender, p_recipient_id, v_body, p_kind,
    CASE WHEN p_kind = 'post_share' THEN p_post_id ELSE NULL END,
    CASE WHEN p_kind = 'profile_share' THEN p_profile_id ELSE NULL END,
    now())
  RETURNING id INTO v_msg_id;

  SELECT username INTO v_sender_username FROM public.profiles WHERE id = v_sender;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (p_recipient_id, 'dm_share',
    CASE WHEN p_kind = 'post_share' THEN 'A post was shared with you' ELSE 'A profile was shared with you' END,
    CASE WHEN v_sender_username IS NOT NULL THEN '@' || v_sender_username || ' shared something with you' ELSE 'You have a new shared item' END,
    jsonb_build_object('link', '/messages/' || v_sender::text, 'sender_id', v_sender,
      'sender_username', v_sender_username, 'kind', p_kind, 'post_id', p_post_id,
      'profile_id', p_profile_id, 'message_id', v_msg_id));

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id, 'deduped', false);
END;
$$;

REVOKE ALL ON FUNCTION public.send_dm_share(uuid, text, uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_dm_share(uuid, text, uuid, uuid, text, uuid) TO authenticated;