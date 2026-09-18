DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.check_and_record_rate_limit(TEXT, TEXT, INT, INT)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_and_record_rate_limit(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.check_and_record_rate_limit(TEXT, TEXT, INT, INT)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_and_record_rate_limit(TEXT, TEXT, INT, INT) TO service_role';
  END IF;
END $lgp_guard$;
