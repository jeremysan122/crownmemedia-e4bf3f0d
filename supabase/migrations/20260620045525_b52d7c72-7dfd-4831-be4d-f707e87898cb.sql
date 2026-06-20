
-- Auto-verify admin accounts: backfill existing admins and add trigger for future role grants.

-- 1. Backfill: any user holding an admin-tier role is marked verified.
UPDATE public.profiles p
SET verified = true
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id
    AND ur.role IN ('admin','super_admin','finance_admin','security_admin','content_admin','support_admin','moderator')
);

-- 2. Trigger: when a user is granted an admin-tier role, flip verified=true automatically.
CREATE OR REPLACE FUNCTION public.auto_verify_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('admin','super_admin','finance_admin','security_admin','content_admin','support_admin','moderator') THEN
    UPDATE public.profiles
       SET verified = true
     WHERE id = NEW.user_id
       AND verified IS DISTINCT FROM true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_verify_admin_role ON public.user_roles;
CREATE TRIGGER trg_auto_verify_admin_role
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.auto_verify_admin_role();
