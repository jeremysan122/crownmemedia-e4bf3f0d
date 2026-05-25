-- 1) Attachment fields on messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_size integer,
  ADD COLUMN IF NOT EXISTS attachment_type text;

-- 2) Message reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON public.message_reactions(message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants view reactions" ON public.message_reactions;
CREATE POLICY "Participants view reactions"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users add own reactions" ON public.message_reactions;
CREATE POLICY "Users add own reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users remove own reactions" ON public.message_reactions;
CREATE POLICY "Users remove own reactions"
  ON public.message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- 3) Muted DM threads (per-other-user)
CREATE TABLE IF NOT EXISTS public.muted_dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  other_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, other_user_id)
);

ALTER TABLE public.muted_dm_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads muted dm" ON public.muted_dm_threads;
CREATE POLICY "Owner reads muted dm" ON public.muted_dm_threads
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner inserts muted dm" ON public.muted_dm_threads;
CREATE POLICY "Owner inserts muted dm" ON public.muted_dm_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner deletes muted dm" ON public.muted_dm_threads;
CREATE POLICY "Owner deletes muted dm" ON public.muted_dm_threads
  FOR DELETE USING (auth.uid() = user_id);

-- 4) Replace DM notification trigger to honor mute
CREATE OR REPLACE FUNCTION public.trg_notify_dm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Suppress if recipient muted the sender or has dm alerts off
  IF EXISTS (
    SELECT 1 FROM public.muted_dm_threads
    WHERE user_id = new.receiver_id AND other_user_id = new.sender_id
  ) THEN
    RETURN null;
  END IF;
  IF NOT public.notif_pref(new.receiver_id, 'dm') THEN
    RETURN null;
  END IF;

  insert into public.notifications (user_id, type, title, body, payload)
  values (new.receiver_id, 'dm', 'New message',
          left(coalesce(new.body, 'Shared content'), 80),
          jsonb_build_object('sender_id', new.sender_id, 'message_id', new.id));
  return null;
end $function$;

-- 5) Private storage bucket for DM attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('dm-attachments', 'dm-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: build canonical pair folder name from two uuids (sorted)
CREATE OR REPLACE FUNCTION public.dm_pair_folder(_a uuid, _b uuid)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN _a < _b
    THEN _a::text || '__' || _b::text
    ELSE _b::text || '__' || _a::text
  END;
$$;

DROP POLICY IF EXISTS "DM attachments owner read" ON storage.objects;
CREATE POLICY "DM attachments owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dm-attachments'
    AND position(auth.uid()::text in (storage.foldername(name))[1]) > 0
  );

DROP POLICY IF EXISTS "DM attachments participant upload" ON storage.objects;
CREATE POLICY "DM attachments participant upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dm-attachments'
    AND position(auth.uid()::text in (storage.foldername(name))[1]) > 0
  );

DROP POLICY IF EXISTS "DM attachments owner delete" ON storage.objects;
CREATE POLICY "DM attachments owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'dm-attachments'
    AND owner = auth.uid()
  );
