DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.fx_is_missing(text, numeric)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fx_is_missing(text, numeric) TO PUBLIC';
  END IF;
END $lgp_guard$;
