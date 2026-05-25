
DROP VIEW IF EXISTS public.gift_transactions_public;

CREATE VIEW public.gift_transactions_public
WITH (security_invoker = true) AS
SELECT
  id,
  sender_id,
  receiver_id,
  post_id,
  gift_id,
  gift_name,
  quantity,
  total_shekels,
  created_at
FROM public.gift_transactions;

REVOKE ALL ON public.gift_transactions_public FROM PUBLIC;
GRANT SELECT ON public.gift_transactions_public TO anon, authenticated;

-- Add a permissive RLS policy that authorizes reads of only the safe columns.
-- Combined with column-level GRANTs below, sensitive columns remain hidden.
DROP POLICY IF EXISTS "Public can read non-sensitive gift columns" ON public.gift_transactions;
CREATE POLICY "Public can read non-sensitive gift columns"
ON public.gift_transactions
FOR SELECT
USING (true);

-- Restrict column-level SELECT on the underlying table for anon/authenticated
-- so they can only read the safe columns directly or via the view.
REVOKE SELECT ON public.gift_transactions FROM anon, authenticated;
GRANT SELECT (
  id,
  sender_id,
  receiver_id,
  post_id,
  gift_id,
  gift_name,
  quantity,
  total_shekels,
  created_at,
  status
) ON public.gift_transactions TO anon, authenticated;
