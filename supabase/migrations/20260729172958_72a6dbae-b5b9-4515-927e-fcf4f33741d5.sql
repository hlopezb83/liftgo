REVOKE ALL ON FUNCTION public.guard_quote_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_quote_delete() TO service_role;