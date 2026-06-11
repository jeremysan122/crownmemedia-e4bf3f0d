
-- 1) messages: gift fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS gift_transaction_id uuid REFERENCES public.gift_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_seen_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_kind_check') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text','gift'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_gift_tx_idx ON public.messages(gift_transaction_id) WHERE gift_transaction_id IS NOT NULL;

-- 2) Tighten send policy so end users can only insert text messages
DROP POLICY IF EXISTS "Users send DMs as themselves" ON public.messages;
CREATE POLICY "Users send DMs as themselves"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND kind = 'text'
    AND gift_transaction_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks
       WHERE blocks.blocker_id = messages.receiver_id
         AND blocks.blocked_id = auth.uid()
    )
  );

-- 3) notification enum: add dm_gift
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
     WHERE t.typname='notification_type' AND e.enumlabel='dm_gift'
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE 'dm_gift';
  END IF;
END $$;

-- 4) Realtime publication
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
