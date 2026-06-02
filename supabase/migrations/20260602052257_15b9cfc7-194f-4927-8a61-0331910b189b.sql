-- Replace the update guard so authors cannot flip is_sensitive / sensitive_reason after insert
CREATE OR REPLACE FUNCTION public.guard_posts_moderation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                OR public.has_role(auth.uid(), 'moderator'::app_role);

  IF NOT is_privileged THEN
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
      RAISE EXCEPTION 'Only moderators can change moderation_status';
    END IF;
    IF NEW.moderation_notes IS DISTINCT FROM OLD.moderation_notes THEN
      RAISE EXCEPTION 'Only moderators can change moderation_notes';
    END IF;
    IF NEW.moderated_by IS DISTINCT FROM OLD.moderated_by THEN
      RAISE EXCEPTION 'Only moderators can change moderated_by';
    END IF;
    IF NEW.moderated_at IS DISTINCT FROM OLD.moderated_at THEN
      RAISE EXCEPTION 'Only moderators can change moderated_at';
    END IF;
    IF NEW.is_sensitive IS DISTINCT FROM OLD.is_sensitive THEN
      RAISE EXCEPTION 'Only moderators can change is_sensitive after upload';
    END IF;
    IF NEW.sensitive_reason IS DISTINCT FROM OLD.sensitive_reason THEN
      RAISE EXCEPTION 'Only moderators can change sensitive_reason after upload';
    END IF;
    IF NEW.content_rating IS DISTINCT FROM OLD.content_rating
       AND NEW.content_rating = 'explicit' THEN
      RAISE EXCEPTION 'Only moderators can mark content as explicit';
    END IF;
  ELSE
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
      NEW.moderated_by := auth.uid();
      NEW.moderated_at := now();
      IF NEW.moderation_status = 'removed' THEN
        NEW.is_removed := true;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Audit-log trigger: write to admin_audit_log on any moderation-field change
CREATE OR REPLACE FUNCTION public.log_posts_moderation_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changes jsonb := '{}'::jsonb;
BEGIN
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
    changes := changes || jsonb_build_object('moderation_status',
      jsonb_build_object('old', OLD.moderation_status, 'new', NEW.moderation_status));
  END IF;
  IF NEW.content_rating IS DISTINCT FROM OLD.content_rating THEN
    changes := changes || jsonb_build_object('content_rating',
      jsonb_build_object('old', OLD.content_rating, 'new', NEW.content_rating));
  END IF;
  IF NEW.is_sensitive IS DISTINCT FROM OLD.is_sensitive THEN
    changes := changes || jsonb_build_object('is_sensitive',
      jsonb_build_object('old', OLD.is_sensitive, 'new', NEW.is_sensitive));
  END IF;
  IF NEW.sensitive_reason IS DISTINCT FROM OLD.sensitive_reason THEN
    changes := changes || jsonb_build_object('sensitive_reason',
      jsonb_build_object('old', OLD.sensitive_reason, 'new', NEW.sensitive_reason));
  END IF;
  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed THEN
    changes := changes || jsonb_build_object('is_removed',
      jsonb_build_object('old', OLD.is_removed, 'new', NEW.is_removed));
  END IF;
  IF NEW.moderation_notes IS DISTINCT FROM OLD.moderation_notes THEN
    changes := changes || jsonb_build_object('moderation_notes',
      jsonb_build_object('old', OLD.moderation_notes, 'new', NEW.moderation_notes));
  END IF;

  IF changes <> '{}'::jsonb AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      'post_moderation_update',
      'post',
      NEW.id::text,
      jsonb_build_object('post_user_id', NEW.user_id, 'changes', changes)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_posts_moderation_changes ON public.posts;
CREATE TRIGGER trg_log_posts_moderation_changes
AFTER UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.log_posts_moderation_changes();

-- Allow moderators/admins to read the audit log (currently admin-only). Keep delete/update blocked.
DROP POLICY IF EXISTS "Mods view audit log" ON public.admin_audit_log;
CREATE POLICY "Mods view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'moderator'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Allow the moderation trigger (running as SECURITY DEFINER) to insert without requiring actor=admin
DROP POLICY IF EXISTS "Mod trigger insert audit log" ON public.admin_audit_log;
CREATE POLICY "Mod trigger insert audit log"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND (
      public.is_any_admin(auth.uid())
      OR public.has_role(auth.uid(), 'moderator'::app_role)
    )
  );
