
-- 1. GIFT TRANSACTIONS
DROP POLICY IF EXISTS "Public can view gift feed" ON public.gift_transactions;

DROP VIEW IF EXISTS public.gift_transactions_public;

CREATE VIEW public.gift_transactions_public AS
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

-- 2. REALTIME postgres_changes scoping
DROP POLICY IF EXISTS "Users subscribe to own topic only" ON realtime.messages;

CREATE POLICY "Users subscribe to own topic only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    extension = 'postgres_changes'
    AND realtime.topic() = (auth.uid())::text
  )
  OR (
    extension = ANY (ARRAY['broadcast'::text, 'presence'::text])
    AND (
      realtime.topic() = (auth.uid())::text
      OR (
        realtime.topic() LIKE 'dm-typing:%'
        AND POSITION(((auth.uid())::text) IN (realtime.topic())) > 0
      )
    )
  )
);

-- 3. BOOSTS owner-only read
DROP POLICY IF EXISTS "Boosts viewable by everyone" ON public.boosts;
DROP POLICY IF EXISTS "Users view own boosts" ON public.boosts;

CREATE POLICY "Users view own boosts"
ON public.boosts
FOR SELECT
USING (auth.uid() = user_id);

-- 4. AGE GATE constraint
ALTER TABLE public.profiles_private
  DROP CONSTRAINT IF EXISTS profiles_private_dob_adult_chk;

ALTER TABLE public.profiles_private
  ADD CONSTRAINT profiles_private_dob_adult_chk
  CHECK (dob <= (CURRENT_DATE - INTERVAL '18 years'));

-- 5. Lock down anon-callable helper RPCs
REVOKE ALL ON FUNCTION public.notif_pref(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notif_pref(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_thread_muted(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_thread_muted(uuid, uuid) TO authenticated;

-- 6. DM ATTACHMENTS strict participant check
DROP POLICY IF EXISTS "DM attachments owner read" ON storage.objects;
DROP POLICY IF EXISTS "DM attachments participant upload" ON storage.objects;
DROP POLICY IF EXISTS "DM attachments participant read" ON storage.objects;
DROP POLICY IF EXISTS "DM attachments owner upload" ON storage.objects;
DROP POLICY IF EXISTS "DM attachments owner delete" ON storage.objects;

CREATE POLICY "DM attachments participant read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dm-attachments'
  AND array_length(string_to_array((storage.foldername(name))[1], '__'), 1) = 2
  AND (
    auth.uid()::text = split_part((storage.foldername(name))[1], '__', 1)
    OR auth.uid()::text = split_part((storage.foldername(name))[1], '__', 2)
  )
  AND (storage.foldername(name))[1] = public.dm_pair_folder(
    split_part((storage.foldername(name))[1], '__', 1)::uuid,
    split_part((storage.foldername(name))[1], '__', 2)::uuid
  )
);

CREATE POLICY "DM attachments participant upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dm-attachments'
  AND array_length(string_to_array((storage.foldername(name))[1], '__'), 1) = 2
  AND (
    auth.uid()::text = split_part((storage.foldername(name))[1], '__', 1)
    OR auth.uid()::text = split_part((storage.foldername(name))[1], '__', 2)
  )
  AND (storage.foldername(name))[1] = public.dm_pair_folder(
    split_part((storage.foldername(name))[1], '__', 1)::uuid,
    split_part((storage.foldername(name))[1], '__', 2)::uuid
  )
);

CREATE POLICY "DM attachments owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'dm-attachments'
  AND owner = auth.uid()
);
