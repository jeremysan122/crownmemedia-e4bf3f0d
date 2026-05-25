ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_pair_created
  ON public.messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_recv_unread
  ON public.messages (receiver_id) WHERE read = false;
