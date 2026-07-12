
-- =========================================================
-- Stage A v3 · Migration 1/3 — Schema foundation
-- Purely additive. No primitive rewrite in this migration.
-- Rewrites of debit_shekels / debit_boost_token / promo triggers
-- and ACL lockdown land in M2 and M3 after this is approved.
-- =========================================================

-- ---------- 1. Harden debit_operations for fingerprint idempotency ----------
ALTER TABLE public.debit_operations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending','completed','failed')),
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS caller text,
  ADD COLUMN IF NOT EXISTS asset_type text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_category text,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Backfill completed_at for legacy rows so historical audits stay coherent.
UPDATE public.debit_operations
   SET completed_at = created_at,
       asset_type   = kind,
       status       = 'completed'
 WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS debit_operations_fingerprint_idx
  ON public.debit_operations (request_fingerprint);
CREATE INDEX IF NOT EXISTS debit_operations_user_kind_idx
  ON public.debit_operations (user_id, kind, created_at DESC);

COMMENT ON COLUMN public.debit_operations.request_fingerprint IS
  'Stable hash of {user,asset,amount,reason,ref_table,ref_id,caller}. Enforced by primitives in M2.';
COMMENT ON COLUMN public.debit_operations.status IS
  'pending → completed | failed. Primitives (M2) INSERT ... ON CONFLICT then lock the pending row before mutating state.';

-- ---------- 2. Generic Shekel spend-allocation ledger ----------
CREATE TABLE IF NOT EXISTS public.shekel_spend_allocations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id           uuid NOT NULL,
  debit_ledger_id        uuid NOT NULL,
  user_id                uuid NOT NULL,
  source_type            text NOT NULL CHECK (source_type IN ('purchased','royal_promo')),
  royal_pass_grant_id    uuid,
  source_credit_ledger_id uuid,
  amount_consumed        integer NOT NULL CHECK (amount_consumed > 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT shekel_spend_alloc_op_fk
    FOREIGN KEY (operation_id) REFERENCES public.debit_operations(operation_id) ON DELETE RESTRICT,
  CONSTRAINT shekel_spend_alloc_ledger_fk
    FOREIGN KEY (debit_ledger_id) REFERENCES public.shekel_ledger(id) ON DELETE RESTRICT,
  CONSTRAINT shekel_spend_alloc_grant_fk
    FOREIGN KEY (royal_pass_grant_id) REFERENCES public.royal_pass_grants(id) ON DELETE RESTRICT,
  CONSTRAINT shekel_spend_alloc_source_ledger_fk
    FOREIGN KEY (source_credit_ledger_id) REFERENCES public.shekel_ledger(id) ON DELETE RESTRICT,
  CONSTRAINT shekel_spend_alloc_royal_needs_grant
    CHECK (source_type <> 'royal_promo' OR royal_pass_grant_id IS NOT NULL)
);

-- Prevent double-allocating the same source to the same operation.
CREATE UNIQUE INDEX IF NOT EXISTS shekel_spend_alloc_op_royal_uidx
  ON public.shekel_spend_allocations (operation_id, royal_pass_grant_id)
  WHERE royal_pass_grant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shekel_spend_alloc_op_purchased_uidx
  ON public.shekel_spend_allocations (operation_id)
  WHERE source_type = 'purchased';

CREATE INDEX IF NOT EXISTS shekel_spend_alloc_user_idx
  ON public.shekel_spend_allocations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shekel_spend_alloc_ledger_idx
  ON public.shekel_spend_allocations (debit_ledger_id);

GRANT SELECT ON public.shekel_spend_allocations TO authenticated;
GRANT ALL    ON public.shekel_spend_allocations TO service_role;

ALTER TABLE public.shekel_spend_allocations ENABLE ROW LEVEL SECURITY;

-- Users may read only their own rows. INSERT/UPDATE/DELETE forbidden from clients;
-- only SECURITY DEFINER primitives (running as service_role) write here.
CREATE POLICY "shekel_spend_allocations_owner_select"
  ON public.shekel_spend_allocations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Immutable evidence: block UPDATE/DELETE even for the row owner.
CREATE OR REPLACE FUNCTION public.shekel_spend_allocations_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'shekel_spend_allocations is append-only (forensic evidence)'
    USING ERRCODE = '42501';
END;
$fn$;

DROP TRIGGER IF EXISTS shekel_spend_allocations_no_update ON public.shekel_spend_allocations;
CREATE TRIGGER shekel_spend_allocations_no_update
  BEFORE UPDATE ON public.shekel_spend_allocations
  FOR EACH ROW EXECUTE FUNCTION public.shekel_spend_allocations_immutable();

DROP TRIGGER IF EXISTS shekel_spend_allocations_no_delete ON public.shekel_spend_allocations;
CREATE TRIGGER shekel_spend_allocations_no_delete
  BEFORE DELETE ON public.shekel_spend_allocations
  FOR EACH ROW EXECUTE FUNCTION public.shekel_spend_allocations_immutable();

-- ---------- 3. Exact boost-token lot model ----------
CREATE TABLE IF NOT EXISTS public.boost_token_lots (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  source_type              text NOT NULL CHECK (source_type IN ('purchased','royal_promo','manual_grant','legacy')),
  royal_pass_grant_id      uuid REFERENCES public.royal_pass_grants(id) ON DELETE RESTRICT,
  source_credit_ledger_id  uuid REFERENCES public.boost_tokens_ledger(id) ON DELETE RESTRICT,
  quantity_granted         integer NOT NULL CHECK (quantity_granted > 0),
  quantity_consumed        integer NOT NULL DEFAULT 0 CHECK (quantity_consumed >= 0),
  quantity_reversed        integer NOT NULL DEFAULT 0 CHECK (quantity_reversed >= 0),
  available_quantity       integer GENERATED ALWAYS AS
    (quantity_granted - quantity_consumed - quantity_reversed) STORED,
  status                   text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disputed','reversed','depleted','locked')),
  granted_at               timestamptz NOT NULL DEFAULT now(),
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT boost_token_lots_royal_needs_grant
    CHECK (source_type <> 'royal_promo' OR royal_pass_grant_id IS NOT NULL),
  CONSTRAINT boost_token_lots_totals
    CHECK (quantity_consumed + quantity_reversed <= quantity_granted)
);

CREATE INDEX IF NOT EXISTS boost_token_lots_fifo_idx
  ON public.boost_token_lots (user_id, status, granted_at)
  WHERE available_quantity > 0;
CREATE INDEX IF NOT EXISTS boost_token_lots_royal_grant_idx
  ON public.boost_token_lots (royal_pass_grant_id)
  WHERE royal_pass_grant_id IS NOT NULL;

GRANT SELECT ON public.boost_token_lots TO authenticated;
GRANT ALL    ON public.boost_token_lots TO service_role;

ALTER TABLE public.boost_token_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boost_token_lots_owner_select"
  ON public.boost_token_lots FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------- 4. Extend boost_token_spend_allocations to reference the exact lot ----------
ALTER TABLE public.boost_token_spend_allocations
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.boost_token_lots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS amount_consumed integer NOT NULL DEFAULT 1
    CHECK (amount_consumed > 0);

-- Immutability triggers for boost-token allocations (evidence table).
CREATE OR REPLACE FUNCTION public.boost_token_spend_allocations_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'boost_token_spend_allocations is append-only (forensic evidence)'
    USING ERRCODE = '42501';
END;
$fn$;

DROP TRIGGER IF EXISTS boost_token_spend_allocations_no_update ON public.boost_token_spend_allocations;
CREATE TRIGGER boost_token_spend_allocations_no_update
  BEFORE UPDATE ON public.boost_token_spend_allocations
  FOR EACH ROW EXECUTE FUNCTION public.boost_token_spend_allocations_immutable();

DROP TRIGGER IF EXISTS boost_token_spend_allocations_no_delete ON public.boost_token_spend_allocations;
CREATE TRIGGER boost_token_spend_allocations_no_delete
  BEFORE DELETE ON public.boost_token_spend_allocations
  FOR EACH ROW EXECUTE FUNCTION public.boost_token_spend_allocations_immutable();

-- ---------- 5. Backfill token lots from existing state ----------
-- Royal-granted lots: one per grant with any promo boost tokens ever granted.
INSERT INTO public.boost_token_lots (
  user_id, source_type, royal_pass_grant_id,
  quantity_granted, quantity_consumed, quantity_reversed, status, granted_at, metadata
)
SELECT g.user_id,
       'royal_promo',
       g.id,
       g.boost_tokens_granted,
       GREATEST(g.boost_tokens_granted - COALESCE(g.promo_boost_tokens_remaining,0) - COALESCE(g.boost_tokens_reversed,0), 0),
       COALESCE(g.boost_tokens_reversed, 0),
       CASE
         WHEN g.status = 'reversed'          THEN 'reversed'
         WHEN g.status IN ('disputed','suspended','needs_reconciliation') THEN 'disputed'
         WHEN g.needs_reconciliation         THEN 'locked'
         ELSE 'active'
       END,
       g.created_at,
       jsonb_build_object('backfill','v3-m1','source','royal_pass_grants')
  FROM public.royal_pass_grants g
 WHERE g.boost_tokens_granted > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.boost_token_lots l WHERE l.royal_pass_grant_id = g.id
   );

-- Purchased/legacy lots: one aggregate per user for any non-royal positive delta history.
-- Consumed_quantity is derived from historical negative ledger rows so profile balance
-- reconciles. This is a legacy bucket — new purchases (M2+) will create precise per-purchase lots.
WITH per_user AS (
  SELECT user_id,
         COALESCE(SUM(CASE WHEN delta > 0 AND reason NOT IN ('royal_monthly','royal_reinstate') THEN delta ELSE 0 END), 0) AS granted,
         COALESCE(SUM(CASE WHEN delta < 0 AND reason NOT IN ('royal_reversal') THEN -delta ELSE 0 END), 0) AS consumed,
         COALESCE(SUM(CASE WHEN delta < 0 AND reason  =  'royal_reversal' THEN -delta ELSE 0 END), 0) AS reversed,
         MIN(created_at) AS earliest
    FROM public.boost_tokens_ledger
   GROUP BY user_id
)
INSERT INTO public.boost_token_lots (
  user_id, source_type, quantity_granted, quantity_consumed, quantity_reversed,
  status, granted_at, metadata
)
SELECT pu.user_id,
       'legacy',
       GREATEST(pu.granted, 1),                 -- ensure > 0 for CHECK constraint
       LEAST(pu.consumed, pu.granted),
       LEAST(pu.reversed, GREATEST(pu.granted - pu.consumed, 0)),
       'active',
       COALESCE(pu.earliest, now()),
       jsonb_build_object('backfill','v3-m1','source','legacy_ledger_aggregate',
                          'raw_granted', pu.granted, 'raw_consumed', pu.consumed, 'raw_reversed', pu.reversed)
  FROM per_user pu
 WHERE pu.granted > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.boost_token_lots l
      WHERE l.user_id = pu.user_id AND l.source_type = 'legacy'
   );

-- ---------- 6. Introspection helper (admin-only) for the source-contract tests ----------
CREATE OR REPLACE FUNCTION public.admin_inspect_debit_stack()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'functions', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'security_definer', p.prosecdef,
        'acl',  COALESCE((SELECT jsonb_agg(a::text) FROM unnest(p.proacl) a), '[]'::jsonb),
        'body', pg_get_functiondef(p.oid)
      ))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'debit_shekels','debit_boost_token',
          'royal_locked_promo_shekels','royal_spendable_shekels','royal_debits_paused',
          'my_spendable_shekels'
        )
    ),
    'triggers', (
      SELECT jsonb_agg(jsonb_build_object(
        'table', c.relname,
        'name',  t.tgname,
        'def',   pg_get_triggerdef(t.oid)
      ))
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND c.relname IN (
          'shekel_ledger','boost_tokens_ledger','royal_pass_grants',
          'wallets','profiles',
          'shekel_spend_allocations','boost_token_spend_allocations','boost_token_lots'
        )
    ),
    'generated_at', now()
  );
$$;

REVOKE ALL ON FUNCTION public.admin_inspect_debit_stack() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inspect_debit_stack() TO service_role;

COMMENT ON FUNCTION public.admin_inspect_debit_stack() IS
  'Live introspection for source-contract tests. Admin/service-role only.';
