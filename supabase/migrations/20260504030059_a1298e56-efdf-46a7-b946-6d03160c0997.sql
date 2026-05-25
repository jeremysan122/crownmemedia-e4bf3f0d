-- 1) DM attachments: enforce block-check and restrict to safe MIME types on INSERT
DROP POLICY IF EXISTS "DM attachments participant upload" ON storage.objects;

CREATE POLICY "DM attachments participant upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dm-attachments'
  AND array_length(string_to_array((storage.foldername(name))[1], '__'), 1) = 2
  AND (
    (auth.uid())::text = split_part((storage.foldername(name))[1], '__', 1)
    OR (auth.uid())::text = split_part((storage.foldername(name))[1], '__', 2)
  )
  AND (storage.foldername(name))[1] = public.dm_pair_folder(
    (split_part((storage.foldername(name))[1], '__', 1))::uuid,
    (split_part((storage.foldername(name))[1], '__', 2))::uuid
  )
  -- Block check: receiver (the other participant) must not have blocked uploader
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE b.blocked_id = auth.uid()
      AND b.blocker_id::text = CASE
        WHEN (auth.uid())::text = split_part((storage.foldername(name))[1], '__', 1)
          THEN split_part((storage.foldername(name))[1], '__', 2)
        ELSE split_part((storage.foldername(name))[1], '__', 1)
      END
  )
  -- Restrict MIME types to safe categories (images, pdf, common docs, text, archives).
  -- Blocks executables/scripts (.exe, .apk, .sh, .ps1, .bat, .dmg, .msi, .js, .html, etc.)
  AND (
    lower(coalesce(metadata->>'mimetype', '')) IN (
      'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif','image/avif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'application/x-zip-compressed'
    )
  )
);

-- 2) Realtime postgres_changes: allow authenticated subscribers on any topic.
-- Underlying table RLS still gates which rows are delivered, so private tables
-- (messages, notifications, wallets, etc.) remain protected. Public tables
-- (posts, votes, battles, battle_votes) intentionally broadcast row changes.
DROP POLICY IF EXISTS "Users subscribe to own topic only" ON realtime.messages;

CREATE POLICY "Users subscribe to own topic only"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  -- postgres_changes: rely on per-table RLS to filter visible rows
  (extension = 'postgres_changes')
  -- broadcast/presence: keep strict topic-scoping (own uid or dm-typing pair)
  OR (
    extension = ANY (ARRAY['broadcast'::text, 'presence'::text])
    AND (
      realtime.topic() = (auth.uid())::text
      OR (
        realtime.topic() LIKE 'dm-typing:%'
        AND (auth.uid())::text = ANY (
          string_to_array(split_part(realtime.topic(), ':', 2), '__')
        )
      )
    )
  )
);