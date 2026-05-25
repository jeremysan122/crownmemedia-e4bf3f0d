-- Lock down trigger function (only the trigger needs to invoke it; owner-run)
REVOKE EXECUTE ON FUNCTION public.trg_admin_audit() FROM PUBLIC, anon, authenticated;

-- is_any_admin: already granted to authenticated, ensure PUBLIC and anon are revoked
REVOKE EXECUTE ON FUNCTION public.is_any_admin(uuid) FROM PUBLIC, anon;