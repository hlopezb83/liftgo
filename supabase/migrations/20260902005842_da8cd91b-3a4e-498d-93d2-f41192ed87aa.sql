DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.fx_is_missing(text, numeric)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fx_is_missing(text, numeric) FROM anon';
  END IF;
END $lgp_guard$;
