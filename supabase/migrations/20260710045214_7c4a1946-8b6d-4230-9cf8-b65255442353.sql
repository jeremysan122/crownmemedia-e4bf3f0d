
-- 1. Moderation columns
ALTER TABLE public.live_battle_comments
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hide_reason text;

-- Replace read policy so hidden comments hide from non-authors / non-mods
DROP POLICY IF EXISTS "live_battle_comments_read_all_auth" ON public.live_battle_comments;

CREATE POLICY "live_battle_comments_read_visible"
  ON public.live_battle_comments
  FOR SELECT
  TO authenticated
  USING (
    hidden_at IS NULL
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'content_admin')
  );

-- Only moderators/admins may update (to set hidden state). Column-level guarded via function.
CREATE POLICY "live_battle_comments_mod_update"
  ON public.live_battle_comments
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'content_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'content_admin')
  );

GRANT UPDATE (hidden_at, hidden_by, hide_reason) ON public.live_battle_comments TO authenticated;

-- Efficient older-page fetch by battle
CREATE INDEX IF NOT EXISTS live_battle_comments_battle_created_visible_idx
  ON public.live_battle_comments (battle_id, created_at DESC)
  WHERE hidden_at IS NULL;

-- 2. Reports table
CREATE TABLE IF NOT EXISTS public.live_battle_comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.live_battle_comments(id) ON DELETE CASCADE,
  battle_id uuid NOT NULL REFERENCES public.live_battles(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_id)
);

GRANT SELECT, INSERT ON public.live_battle_comment_reports TO authenticated;
GRANT ALL ON public.live_battle_comment_reports TO service_role;

ALTER TABLE public.live_battle_comment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lbcr_insert_self"
  ON public.live_battle_comment_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "lbcr_read_self_or_mod"
  ON public.live_battle_comment_reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'content_admin')
  );

CREATE INDEX IF NOT EXISTS lbcr_battle_created_idx
  ON public.live_battle_comment_reports (battle_id, created_at DESC);

-- 3. Admin hide/unhide RPC with audit log
CREATE OR REPLACE FUNCTION public.admin_hide_live_battle_comment(
  _comment_id uuid,
  _hide boolean,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (
    public.has_role(_uid, 'moderator')
    OR public.has_role(_uid, 'admin')
    OR public.has_role(_uid, 'super_admin')
    OR public.has_role(_uid, 'content_admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _hide THEN
    UPDATE public.live_battle_comments
       SET hidden_at = now(), hidden_by = _uid, hide_reason = NULLIF(btrim(coalesce(_reason,'')), '')
     WHERE id = _comment_id;
  ELSE
    UPDATE public.live_battle_comments
       SET hidden_at = NULL, hidden_by = NULL, hide_reason = NULL
     WHERE id = _comment_id;
  END IF;

  BEGIN
    INSERT INTO public.moderation_audit (actor_id, action, target_type, target_id, notes)
    VALUES (_uid, CASE WHEN _hide THEN 'hide_live_battle_comment' ELSE 'unhide_live_battle_comment' END,
            'live_battle_comment', _comment_id, _reason);
  EXCEPTION WHEN OTHERS THEN
    -- Do not fail moderation if audit schema differs.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hide_live_battle_comment(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hide_live_battle_comment(uuid, boolean, text) TO authenticated;
