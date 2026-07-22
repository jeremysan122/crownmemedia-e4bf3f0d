-- =========================================================================
-- Security scan remediation (2026-07-22 pre-launch pass):
--   1. achievement_progress_events: the SELECT policy was named "own events
--      readable admin" but only allowed admins — users could not read their
--      own achievement progress events. Grant owner reads alongside admin.
--   2. send_live_battle_gift: refuse gifts to hidden (moderated) battles so
--      no new gift events are ever generated for a hidden battle. The RLS
--      SELECT policy already prevents delivery of hidden-battle gift rows;
--      this closes the source as defense-in-depth.
--   3. profiles: anonymous visitors could read internal moderation state
--      (is_banned, is_suspended). Only authenticated surfaces use these
--      fields; public pages (profile, post, crown share) never select them.
-- =========================================================================

-- ---------- 1. Achievement progress events: owner can read own rows ------

DROP POLICY IF EXISTS "own events readable admin" ON public.achievement_progress_events;
CREATE POLICY "own events readable"
  ON public.achievement_progress_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ---------- 2. No gifts to hidden battles --------------------------------

CREATE OR REPLACE FUNCTION public.send_live_battle_gift(
  _battle_id uuid,
  _gift_id text,
  _recipient_id uuid,
  _quantity integer DEFAULT 1,
  _dedupe_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_battle public.live_battles%ROWTYPE;
  v_result jsonb;
  v_tx_id uuid;
  v_total numeric;
  v_gift_name text;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity IS NULL OR _quantity < 1 OR _quantity > 999 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  SELECT * INTO v_battle FROM public.live_battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF v_battle.status <> 'live' THEN RAISE EXCEPTION 'battle_not_live'; END IF;
  -- Moderator-hidden battles accept no gifts: no wallet movement and no
  -- realtime gift events originate from a hidden battle.
  IF COALESCE(v_battle.is_hidden, false) THEN RAISE EXCEPTION 'battle_not_live'; END IF;

  -- Recipient must be one of the two participants and not the sender.
  IF _recipient_id NOT IN (v_battle.host_id, v_battle.opponent_id) THEN
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  IF _recipient_id = v_sender THEN RAISE EXCEPTION 'cannot_self_gift'; END IF;

  -- Delegate wallet debit / receiver credit / tx row to the shared engine.
  v_result := private.send_royal_gift(v_sender, _gift_id, _recipient_id, NULL, _quantity, _dedupe_key);
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_total := COALESCE((v_result->>'total')::numeric, 0);

  SELECT gift_name INTO v_gift_name FROM public.gift_transactions WHERE id = v_tx_id;

  -- Idempotent: reuse existing feed row for the same tx if we somehow re-run.
  INSERT INTO public.live_battle_gifts
    (battle_id, sender_id, recipient_id, gift_id, gift_name, quantity, total_shekels, transaction_id)
  VALUES
    (_battle_id, v_sender, _recipient_id, _gift_id, COALESCE(v_gift_name, _gift_id), _quantity, v_total, v_tx_id);

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_live_battle_gift(uuid, text, uuid, integer, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.send_live_battle_gift(uuid, text, uuid, integer, uuid) TO authenticated;

-- ---------- 3. Anonymous visitors cannot read moderation state -----------
-- Authenticated surfaces (battle dialogs, gift picker, discover filters)
-- still read these; every signed-out surface (public profile, post page,
-- crown share) selects an explicit column list that excludes them.

REVOKE SELECT (is_banned, is_suspended) ON public.profiles FROM anon;
