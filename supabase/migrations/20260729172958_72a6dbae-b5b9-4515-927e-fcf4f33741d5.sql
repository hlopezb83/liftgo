DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.guard_quote_delete()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.guard_quote_delete() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.guard_quote_delete()') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.guard_quote_delete() TO service_role';
  END IF;
END $lgp_guard$;
