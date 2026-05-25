-- Replace the SELECT/INSERT realtime policies to additionally permit
-- the deterministic `dm-typing:<idA>__<idB>` topic when the caller is one
-- of the two participants in the topic name.

DROP POLICY IF EXISTS "Users subscribe to own topic only" ON realtime.messages;
CREATE POLICY "Users subscribe to own topic only"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'postgres_changes'
    OR (
      extension IN ('broadcast','presence')
      AND (
        realtime.topic() = auth.uid()::text
        OR (
          realtime.topic() LIKE 'dm-typing:%'
          AND position(auth.uid()::text in realtime.topic()) > 0
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users send to own topic only" ON realtime.messages;
CREATE POLICY "Users send to own topic only"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension IN ('broadcast','presence')
    AND (
      realtime.topic() = auth.uid()::text
      OR (
        realtime.topic() LIKE 'dm-typing:%'
        AND position(auth.uid()::text in realtime.topic()) > 0
      )
    )
  );
