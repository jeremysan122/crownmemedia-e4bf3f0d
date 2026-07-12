
-- =============================================================
-- Wave 8.2b Patch: remaining hardening (blockers 3, 8, 9, 10)
-- =============================================================

-- ---------- Blocker 9: lock down promo-consumption trigger fns ----------
CREATE OR REPLACE FUNCTION public.trg_consume_royal_promo_shekels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rem int; take int; g record;
BEGIN
  -- Only debits consume promo balance.
  IF NEW.shekels_delta >= 0 THEN RETURN NEW; END IF;
  -- Ignore royal-lifecycle rows (they operate on promo columns themselves).
  IF NEW.kind IN ('royal_monthly','royal_reversal','royal_reinstate') THEN
    RETURN NEW;
  END IF;

  rem := -NEW.shekels_delta;  -- positive amount to consume

  FOR g IN
    SELECT id, promo_shekels_remaining
      FROM public.royal_pass_grants
     WHERE user_id = NEW.user_id
       AND status IN ('granted','disputed')
       AND promo_shekels_remaining > 0
     ORDER BY period_start ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN rem <= 0;
    take := LEAST(rem, g.promo_shekels_remaining);
    UPDATE public.royal_pass_grants
       SET promo_shekels_remaining = promo_shekels_remaining - take
     WHERE id = g.id;
    rem := rem - take;
  END LOOP;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.trg_consume_royal_promo_shekels() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_consume_royal_promo_boost_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rem int; take int; g record;
BEGIN
  IF NEW.delta >= 0 THEN RETURN NEW; END IF;
  IF NEW.reason IN ('royal_monthly','royal_reversal','royal_reinstate') THEN
    RETURN NEW;
  END IF;

  rem := -NEW.delta;
  FOR g IN
    SELECT id, promo_boost_tokens_remaining
      FROM public.royal_pass_grants
     WHERE user_id = NEW.user_id
       AND status IN ('granted','disputed')
       AND promo_boost_tokens_remaining > 0
     ORDER BY period_start ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN rem <= 0;
    take := LEAST(rem, g.promo_boost_tokens_remaining);
    UPDATE public.royal_pass_grants
       SET promo_boost_tokens_remaining = promo_boost_tokens_remaining - take
     WHERE id = g.id;
    rem := rem - take;
  END LOOP;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.trg_consume_royal_promo_boost_tokens() FROM PUBLIC;

-- Re-attach (defensive): drop if present, recreate.
DROP TRIGGER IF EXISTS trg_shekel_ledger_consume_promo ON public.shekel_ledger;
CREATE TRIGGER trg_shekel_ledger_consume_promo
AFTER INSERT ON public.shekel_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_consume_royal_promo_shekels();

DROP TRIGGER IF EXISTS trg_boost_tokens_ledger_consume_promo ON public.boost_tokens_ledger;
CREATE TRIGGER trg_boost_tokens_ledger_consume_promo
AFTER INSERT ON public.boost_tokens_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_consume_royal_promo_boost_tokens();

-- ---------- Blocker 3: gift transactions -> shekel ledger bridge ----------
CREATE OR REPLACE FUNCTION public.trg_gift_transactions_to_shekel_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Record the sender's outflow so the promo-consume trigger sees the debit.
  -- We rely on gift_transactions.shekels_spent being > 0 for the sender.
  IF NEW.sender_id IS NOT NULL AND COALESCE(NEW.shekels_spent, 0) > 0 THEN
    INSERT INTO public.shekel_ledger(user_id, kind, shekels_delta, label, metadata)
    VALUES (NEW.sender_id, 'gift_send', -NEW.shekels_spent, 'Gift sent',
            jsonb_build_object('gift_transaction_id', NEW.id,
                               'gift_id', NEW.gift_id,
                               'recipient_id', NEW.recipient_id));
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.trg_gift_transactions_to_shekel_ledger() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_gift_tx_to_shekel_ledger ON public.gift_transactions;
CREATE TRIGGER trg_gift_tx_to_shekel_ledger
AFTER INSERT ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_gift_transactions_to_shekel_ledger();

-- ---------- Blocker 8: protect Royal / Founder fields from client edits ----------
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- service_role and postgres bypass; everyone else is checked.
  is_privileged := current_setting('role', true) = 'service_role'
                OR session_user IN ('postgres','supabase_admin');

  IF is_privileged THEN RETURN NEW; END IF;

  IF NEW.is_royal          IS DISTINCT FROM OLD.is_royal
  OR NEW.is_founder        IS DISTINCT FROM OLD.is_founder
  OR NEW.founder_granted_at IS DISTINCT FROM OLD.founder_granted_at
  OR NEW.founder_title     IS DISTINCT FROM OLD.founder_title
  OR NEW.royal_frame_variant IS DISTINCT FROM OLD.royal_frame_variant
  OR NEW.royal_pass_expires_at IS DISTINCT FROM OLD.royal_pass_expires_at
  OR NEW.boost_tokens_balance  IS DISTINCT FROM OLD.boost_tokens_balance
  THEN
    RAISE EXCEPTION 'protected_field_update_denied'
      USING HINT = 'Royal / Founder / boost-token columns are managed server-side only.';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ---------- Blocker 10: reversal → profile FK ----------
-- Guarantees no orphan reversal rows. Uses RESTRICT to preserve audit history.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'royal_pass_reversals_user_id_profile_fkey'
  ) THEN
    ALTER TABLE public.royal_pass_reversals
      ADD CONSTRAINT royal_pass_reversals_user_id_profile_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END $$;
