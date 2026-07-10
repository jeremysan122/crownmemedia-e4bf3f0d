
-- 1) Live battle gifts feed table
CREATE TABLE IF NOT EXISTS public.live_battle_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.live_battles(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  gift_id text NOT NULL,
  gift_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  total_shekels numeric NOT NULL DEFAULT 0,
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lbg_battle_created ON public.live_battle_gifts (battle_id, created_at DESC);

GRANT SELECT ON public.live_battle_gifts TO authenticated;
GRANT ALL ON public.live_battle_gifts TO service_role;

ALTER TABLE public.live_battle_gifts ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user for a non-hidden battle (viewers see popups).
DROP POLICY IF EXISTS "lbg_read_public" ON public.live_battle_gifts;
CREATE POLICY "lbg_read_public" ON public.live_battle_gifts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.live_battles b
     WHERE b.id = battle_id AND COALESCE(b.is_hidden, false) = false
  ));

-- No direct writes; RPC only.
DROP POLICY IF EXISTS "lbg_no_direct_insert" ON public.live_battle_gifts;
CREATE POLICY "lbg_no_direct_insert" ON public.live_battle_gifts
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "lbg_no_direct_update" ON public.live_battle_gifts;
CREATE POLICY "lbg_no_direct_update" ON public.live_battle_gifts
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "lbg_no_direct_delete" ON public.live_battle_gifts;
CREATE POLICY "lbg_no_direct_delete" ON public.live_battle_gifts
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- Enable realtime broadcast
ALTER TABLE public.live_battle_gifts REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_battle_gifts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) send_live_battle_gift RPC
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
