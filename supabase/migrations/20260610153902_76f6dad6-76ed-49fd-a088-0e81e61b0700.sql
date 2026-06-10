
-- Tighten private schema grants: replace broad ALL FUNCTIONS grant with
-- EXECUTE on only the helper functions invoked by public RPC wrappers.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM authenticated, anon;

-- Keep USAGE on the schema so qualified function references resolve.
GRANT USAGE ON SCHEMA private TO authenticated, anon;

-- Helpers called from public RPC wrappers used by authenticated users.
GRANT EXECUTE ON FUNCTION private.bump_filter_streak(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION private.ensure_my_wallet(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_royal_pass_active(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION private.purchase_boost(uuid, text, integer, numeric)            TO authenticated;
GRANT EXECUTE ON FUNCTION private.purchase_boost(uuid, text, integer, numeric, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION private.send_royal_gift(uuid, text, uuid, uuid, integer, uuid)  TO authenticated;

-- Service role keeps full access for edge functions / admin code.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;

-- Reset default privileges so newly created private functions don't
-- automatically become callable by authenticated/anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT  EXECUTE ON FUNCTIONS TO   service_role;
