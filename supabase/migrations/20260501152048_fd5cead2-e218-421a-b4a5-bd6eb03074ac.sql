-- Ensure RLS is on
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior policies we created
DROP POLICY IF EXISTS "Authenticated can read postgres_changes" ON realtime.messages;
DROP POLICY IF EXISTS "Users subscribe to own topic only" ON realtime.messages;
DROP POLICY IF EXISTS "Users send to own topic only" ON realtime.messages;

-- SELECT: only authenticated users, and only on their own per-user topic
-- (broadcast/presence) OR via postgres_changes which re-checks underlying
-- table RLS for each row event.
CREATE POLICY "Users subscribe to own topic only"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (
      extension IN ('broadcast', 'presence')
      AND realtime.topic() = auth.uid()::text
    )
    OR extension = 'postgres_changes'
  );

-- INSERT: only authenticated users may publish, and only to their own topic
CREATE POLICY "Users send to own topic only"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension IN ('broadcast', 'presence')
    AND realtime.topic() = auth.uid()::text
  );
