-- 1. dm_threads
CREATE TABLE IF NOT EXISTS public.dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  gift_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_threads_sorted CHECK (user_a < user_b),
  CONSTRAINT dm_threads_pair_unique UNIQUE (user_a, user_b)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_threads TO authenticated;
GRANT ALL ON public.dm_threads TO service_role;
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view their threads"
  ON public.dm_threads FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE INDEX idx_dm_threads_user_a ON public.dm_threads(user_a, last_message_at DESC);
CREATE INDEX idx_dm_threads_user_b ON public.dm_threads(user_b, last_message_at DESC);

-- 2. dm_thread_members
CREATE TABLE IF NOT EXISTS public.dm_thread_members (
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  muted boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_thread_members TO authenticated;
GRANT ALL ON public.dm_thread_members TO service_role;
ALTER TABLE public.dm_thread_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view own member row"
  ON public.dm_thread_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "members can update own member row"
  ON public.dm_thread_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_dm_thread_members_user ON public.dm_thread_members(user_id, pinned DESC, archived, updated_at DESC);

-- 3. thread_id on messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.dm_threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_thread ON public.messages(thread_id, created_at DESC);

-- 4. trigger: maintain threads + member rows on new message
CREATE OR REPLACE FUNCTION public.dm_messages_maintain_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a uuid;
  v_b uuid;
  v_thread uuid;
  v_preview text;
BEGIN
  IF NEW.sender_id IS NULL OR NEW.receiver_id IS NULL OR NEW.sender_id = NEW.receiver_id THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id < NEW.receiver_id THEN
    v_a := NEW.sender_id; v_b := NEW.receiver_id;
  ELSE
    v_a := NEW.receiver_id; v_b := NEW.sender_id;
  END IF;

  v_preview := COALESCE(NULLIF(left(NEW.body, 140), ''),
                        CASE WHEN NEW.gift_transaction_id IS NOT NULL THEN '🎁 Gift'
                             WHEN NEW.shared_post_id IS NOT NULL THEN '📷 Shared a post'
                             WHEN NEW.shared_profile_id IS NOT NULL THEN '👤 Shared a profile'
                             WHEN NEW.attachment_path IS NOT NULL THEN '📎 Attachment'
                             ELSE '' END);

  INSERT INTO public.dm_threads (user_a, user_b, last_message_id, last_message_at, last_message_preview, gift_count)
  VALUES (v_a, v_b, NEW.id, NEW.created_at, v_preview, CASE WHEN NEW.gift_transaction_id IS NOT NULL THEN 1 ELSE 0 END)
  ON CONFLICT (user_a, user_b) DO UPDATE
    SET last_message_id = EXCLUDED.last_message_id,
        last_message_at = EXCLUDED.last_message_at,
        last_message_preview = EXCLUDED.last_message_preview,
        gift_count = public.dm_threads.gift_count + CASE WHEN NEW.gift_transaction_id IS NOT NULL THEN 1 ELSE 0 END,
        updated_at = now()
  RETURNING id INTO v_thread;

  NEW.thread_id := v_thread;

  -- ensure both member rows exist
  INSERT INTO public.dm_thread_members (thread_id, user_id, last_read_at, unread_count)
  VALUES (v_thread, NEW.sender_id, NEW.created_at, 0)
  ON CONFLICT (thread_id, user_id) DO UPDATE
    SET last_read_at = NEW.created_at, updated_at = now();

  INSERT INTO public.dm_thread_members (thread_id, user_id, unread_count)
  VALUES (v_thread, NEW.receiver_id, 1)
  ON CONFLICT (thread_id, user_id) DO UPDATE
    SET unread_count = public.dm_thread_members.unread_count + 1, updated_at = now();

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dm_messages_maintain_thread ON public.messages;
CREATE TRIGGER trg_dm_messages_maintain_thread
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.dm_messages_maintain_thread();

CREATE TRIGGER trg_dm_threads_updated_at BEFORE UPDATE ON public.dm_threads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dm_thread_members_updated_at BEFORE UPDATE ON public.dm_thread_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();