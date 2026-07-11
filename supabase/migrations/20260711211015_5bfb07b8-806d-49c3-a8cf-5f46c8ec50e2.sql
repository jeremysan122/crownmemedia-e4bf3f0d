
REVOKE ALL ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_royal_dispute_reinstated(text,text,text,text,text) TO service_role;
