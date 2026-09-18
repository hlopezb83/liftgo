DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.normalize_regimen_fiscal(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.normalize_regimen_fiscal(text) FROM anon';
  END IF;
END $lgp_guard$;
