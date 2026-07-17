-- Auditable, cancellable account-deletion pipeline.
-- Auth identities are irreversibly soft-deleted after 30 days so retained
-- financial/audit rows can continue to reference an anonymized profile
-- tombstone. User content, private profile data, roles and storage are removed.

CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid,
  requested_at timestamptz NOT NULL,
  execute_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','cancelled','completed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_jobs_one_active_user
  ON public.account_deletion_jobs(target_user_id)
  WHERE target_user_id IS NOT NULL AND status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS account_deletion_jobs_due
  ON public.account_deletion_jobs(execute_after, status)
  WHERE status IN ('pending','processing');

ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_deletion_jobs TO service_role;

CREATE TABLE IF NOT EXISTS public.account_deletion_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid
);
CREATE INDEX IF NOT EXISTS account_deletion_holds_active
  ON public.account_deletion_holds(target_user_id)
  WHERE released_at IS NULL;
ALTER TABLE public.account_deletion_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_deletion_holds TO service_role;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_at timestamptz := now();
  v_job_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.profiles
     SET deletion_requested_at = v_at,
         deactivated_at = COALESCE(deactivated_at, v_at)
   WHERE id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  UPDATE public.account_deletion_jobs
     SET requested_at = v_at,
         execute_after = v_at + interval '30 days',
         status = 'pending',
         attempts = 0,
         started_at = NULL,
         completed_at = NULL,
         last_error = NULL,
         updated_at = v_at
   WHERE target_user_id = v_user
     AND status IN ('pending','failed')
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    INSERT INTO public.account_deletion_jobs(target_user_id, requested_at, execute_after)
    VALUES (v_user, v_at, v_at + interval '30 days')
    RETURNING id INTO v_job_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', v_job_id,
    'requested_at', v_at,
    'final_at', v_at + interval '30 days'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.account_deletion_jobs
     SET status = 'cancelled', updated_at = now()
   WHERE target_user_id = v_user
     AND status = 'pending'
     AND execute_after > now()
  RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Deletion grace period has expired or no cancellable request exists';
  END IF;
  UPDATE public.profiles
     SET deletion_requested_at = NULL,
         deactivated_at = NULL
   WHERE id = v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.account_deletion_jobs
     SET status = 'cancelled', updated_at = now()
   WHERE target_user_id = v_user
     AND status = 'pending'
     AND execute_after > now()
  RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Deletion grace period has expired or no cancellable request exists';
  END IF;
  UPDATE public.profiles
     SET deactivated_at = NULL,
         deletion_requested_at = NULL
   WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reactivate_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_my_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_due_account_deletions(_limit integer DEFAULT 10)
RETURNS TABLE(job_id uuid, target_user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT j.id
      FROM public.account_deletion_jobs j
      JOIN public.profiles p ON p.id = j.target_user_id
     WHERE j.execute_after <= now()
       AND p.deletion_requested_at IS NOT NULL
       AND p.deletion_requested_at <= now() - interval '30 days'
       AND (
         j.status = 'pending'
         OR (j.status = 'processing' AND j.started_at < now() - interval '20 minutes')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.account_deletion_holds h
          WHERE h.target_user_id = j.target_user_id
            AND h.released_at IS NULL
            AND (h.expires_at IS NULL OR h.expires_at > now())
       )
     ORDER BY j.execute_after
     FOR UPDATE OF j SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 25)
  )
  UPDATE public.account_deletion_jobs j
     SET status = 'processing',
         attempts = attempts + 1,
         started_at = now(),
         last_error = NULL,
         updated_at = now()
    FROM due
   WHERE j.id = due.id
  RETURNING j.id, j.target_user_id;
$$;

CREATE OR REPLACE FUNCTION public.list_account_storage_objects(
  _job_id uuid,
  _target_user_id uuid,
  _limit integer DEFAULT 1000
)
RETURNS TABLE(bucket_id text, object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_deletion_jobs j
     WHERE j.id = _job_id
       AND j.target_user_id = _target_user_id
       AND j.status = 'processing'
  ) THEN
    RAISE EXCEPTION 'Deletion job is not claimable';
  END IF;

  RETURN QUERY
  SELECT o.bucket_id, o.name
    FROM storage.objects o
   WHERE o.owner_id = _target_user_id::text
      OR o.name LIKE _target_user_id::text || '/%'
   ORDER BY o.bucket_id, o.name
   LIMIT LEAST(GREATEST(COALESCE(_limit, 1000), 1), 1000);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_account_for_permanent_deletion(
  _job_id uuid,
  _target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
DECLARE
  v_fk record;
  v_preserve text[] := ARRAY[
    'account_deletion_jobs','account_deletion_holds',
    'admin_audit_log','moderation_audit','post_edits_audit',
    'gift_transactions','payment_transactions','shekel_ledger',
    'royal_pass_subscriptions','royal_pass_sync_audit','royal_pass_grants',
    'royal_pass_reversals','royal_pass_shield_allowances',
    'boost_tokens_ledger','royal_shield_audit_log','founder_grants',
    'user_legal_acceptances'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.account_deletion_jobs j
      JOIN public.profiles p ON p.id = j.target_user_id
     WHERE j.id = _job_id
       AND j.target_user_id = _target_user_id
       AND j.status = 'processing'
       AND j.execute_after <= now()
       AND p.deletion_requested_at <= now() - interval '30 days'
  ) THEN
    RAISE EXCEPTION 'Deletion job is not ready';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.account_deletion_holds h
     WHERE h.target_user_id = _target_user_id
       AND h.released_at IS NULL
       AND (h.expires_at IS NULL OR h.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Deletion job has an active legal or safety hold';
  END IF;

  IF EXISTS (
    SELECT 1 FROM storage.objects o
     WHERE o.owner_id = _target_user_id::text
        OR o.name LIKE _target_user_id::text || '/%'
  ) THEN
    RAISE EXCEPTION 'User-owned storage objects must be removed first';
  END IF;

  -- Simulate the CASCADE/SET NULL effects of a hard profile/auth deletion,
  -- excluding ledgers and audit records that require a tombstone reference.
  FOR v_fk IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           a.attname AS column_name,
           con.confdeltype
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND array_length(con.conkey, 1) = 1
       AND con.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND NOT (n.nspname = 'public' AND c.relname = ANY(v_preserve))
       AND NOT (n.nspname = 'public' AND c.relname = 'profiles')
  LOOP
    IF v_fk.confdeltype = 'c' THEN
      EXECUTE format('DELETE FROM %I.%I WHERE %I = $1',
        v_fk.schema_name, v_fk.table_name, v_fk.column_name)
      USING _target_user_id;
    ELSIF v_fk.confdeltype = 'n' THEN
      EXECUTE format('UPDATE %I.%I SET %I = NULL WHERE %I = $1',
        v_fk.schema_name, v_fk.table_name, v_fk.column_name, v_fk.column_name)
      USING _target_user_id;
    END IF;
  END LOOP;

  DELETE FROM public.profiles_private WHERE id = _target_user_id;

  UPDATE public.profiles
     SET username = 'deleted_' || left(replace(_target_user_id::text, '-', ''), 16),
         first_name = NULL,
         last_name = NULL,
         bio = NULL,
         city = NULL,
         state = NULL,
         country = NULL,
         profile_photo_url = NULL,
         banner_url = NULL,
         pronouns = NULL,
         gender = NULL,
         links = '[]'::jsonb,
         timezone = NULL,
         default_category = NULL,
         verified = false,
         verified_at = NULL,
         verification_plan = NULL,
         is_private = true,
         posts_visibility = 'private',
         founder_title = NULL,
         equipped_achievement_crown_id = NULL,
         equipped_avatar_frame_id = NULL,
         equipped_frame_key = NULL,
         royal_frame_variant = NULL,
         banned_reason = NULL,
         banned_by = NULL,
         updated_at = now()
   WHERE id = _target_user_id;

  RETURN jsonb_build_object('ok', true, 'job_id', _job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_account_deletion_job(_job_id uuid, _target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.account_deletion_jobs
     SET status = 'completed',
         target_user_id = NULL,
         completed_at = now(),
         last_error = NULL,
         updated_at = now()
   WHERE id = _job_id
     AND target_user_id = _target_user_id
     AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'Deletion job was not completed'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_account_deletion_job(
  _job_id uuid,
  _target_user_id uuid,
  _error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.account_deletion_jobs
     SET status = CASE WHEN attempts >= 10 THEN 'failed' ELSE 'pending' END,
         started_at = NULL,
         last_error = left(COALESCE(_error, 'unknown failure'), 2000),
         updated_at = now()
   WHERE id = _job_id
     AND target_user_id = _target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_account_deletions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_account_storage_objects(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_account_for_permanent_deletion(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_account_deletion_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_account_deletion_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_account_deletions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_account_storage_objects(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_for_permanent_deletion(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion_job(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_account_deletion_job(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
