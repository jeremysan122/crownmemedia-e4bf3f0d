-- 1) PROFILES
REVOKE SELECT (is_banned, is_suspended, deactivated_at)
  ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO service_role;

-- 2) EMAIL_SEND_STATE deny-all
DROP POLICY IF EXISTS "email_send_state_deny_anon" ON public.email_send_state;
DROP POLICY IF EXISTS "email_send_state_deny_authenticated" ON public.email_send_state;
CREATE POLICY "email_send_state_deny_anon"
  ON public.email_send_state AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);
CREATE POLICY "email_send_state_deny_authenticated"
  ON public.email_send_state AS RESTRICTIVE FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- 3) SHARE_CARDS
DROP POLICY IF EXISTS "share_cards readable when not invalidated" ON public.share_cards;
CREATE POLICY "share_cards readable for public-safe targets"
  ON public.share_cards FOR SELECT TO authenticated
  USING (
    invalidated_at IS NULL
    AND is_sensitive_safe = true
    AND (
      target_type <> 'post'
      OR EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = share_cards.target_id
          AND p.is_removed = false
          AND COALESCE(p.is_sensitive, false) = false
          AND p.moderation_status = 'approved'
      )
    )
  );
