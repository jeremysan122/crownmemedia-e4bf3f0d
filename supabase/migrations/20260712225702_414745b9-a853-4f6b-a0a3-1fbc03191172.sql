-- The rewritten primitives added _caller/_request_fingerprint at the end, so Postgres kept the
-- older signatures as separate overloads. Drop them so no caller can accidentally hit the
-- pre-hardening path.
DROP FUNCTION IF EXISTS public.debit_shekels(uuid, numeric, text, uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.debit_boost_token(uuid, text, uuid, text, uuid, jsonb);