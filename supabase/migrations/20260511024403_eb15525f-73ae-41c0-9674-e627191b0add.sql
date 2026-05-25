
REVOKE EXECUTE ON FUNCTION public.update_my_dob(date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_my_dob(date) TO authenticated;
