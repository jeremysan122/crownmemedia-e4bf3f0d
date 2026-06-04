DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND policyname = 'Users subscribe to own topic only'
  ) THEN
    EXECUTE 'DROP POLICY "Users subscribe to own topic only" ON realtime.messages';
  END IF;

  BEGIN
    EXECUTE $POL$
      CREATE POLICY "Users subscribe to own topic only"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        -- Exact match: topic is the user's own UUID
        realtime.topic() = (auth.uid())::text
        -- Or notifications channel scoped to the user: notif-<uid>
        OR realtime.topic() = ('notif-' || (auth.uid())::text)
        OR realtime.topic() = ('user-' || (auth.uid())::text)
        -- Or DM typing channel between the user and another user
        OR (
          realtime.topic() LIKE 'dm-typing:%'
          AND public.dm_typing_topic_allowed(realtime.topic())
        )
      );
    $POL$;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping realtime.messages SELECT policy update (insufficient privilege)';
  END;
END $$;