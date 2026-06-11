
CREATE OR REPLACE FUNCTION public.send_dm_gift(
  p_gift_id text,
  p_recipient_id uuid,
  p_quantity integer,
  p_dedupe_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sender uuid := auth.uid();
  v_started timestamptz := clock_timestamp();
  v_result jsonb;
  v_tx_id uuid;
  v_gift_name text;
  v_total numeric;
  v_msg_id uuid;
  v_sender_username text;
  v_can_dm boolean;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_recipient_id IS NULL OR p_recipient_id = v_sender THEN RAISE EXCEPTION 'Invalid recipient'; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.blocks
     WHERE (blocker_id = v_sender AND blocked_id = p_recipient_id)
        OR (blocker_id = p_recipient_id AND blocked_id = v_sender)
  ) INTO v_can_dm;
  IF NOT v_can_dm THEN RAISE EXCEPTION 'Cannot send to this recipient'; END IF;

  v_result := private.send_royal_gift(v_sender, p_gift_id, p_recipient_id, NULL, p_quantity, p_dedupe_key);
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_total := (v_result->>'total')::numeric;

  SELECT gift_name INTO v_gift_name FROM public.gift_transactions WHERE id = v_tx_id;
  SELECT username INTO v_sender_username FROM public.profiles WHERE id = v_sender;

  IF (v_result->>'deduped')::boolean IS TRUE THEN
    SELECT id INTO v_msg_id FROM public.messages
      WHERE gift_transaction_id = v_tx_id AND sender_id = v_sender AND receiver_id = p_recipient_id
      LIMIT 1;
    IF v_msg_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'message_id', v_msg_id, 'deduped', true);
    END IF;
  END IF;

  INSERT INTO public.messages (sender_id, receiver_id, body, kind, gift_transaction_id, delivered_at)
  VALUES (v_sender, p_recipient_id, '🎁 Sent a royal gift', 'gift', v_tx_id, now())
  RETURNING id INTO v_msg_id;

  DELETE FROM public.notifications
   WHERE user_id = p_recipient_id
     AND type = 'vote'
     AND title = 'Royal Gift received'
     AND created_at >= v_started;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    p_recipient_id,
    'dm_gift',
    'You received a royal gift',
    CASE WHEN v_sender_username IS NOT NULL THEN 'Gift from @' || v_sender_username ELSE 'A royal gift just arrived' END,
    jsonb_build_object(
      'link', '/messages/' || v_sender::text,
      'sender_id', v_sender,
      'sender_username', v_sender_username,
      'gift_id', p_gift_id,
      'gift_name', v_gift_name,
      'message_id', v_msg_id,
      'transaction_id', v_tx_id
    )
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'message_id', v_msg_id, 'total', v_total);
END;
$function$;
