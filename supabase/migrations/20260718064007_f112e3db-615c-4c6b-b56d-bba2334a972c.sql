DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.e2e_seed_scenario(text)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.e2e_seed_scenario(text) TO authenticated';
  END IF;
END $lgp_guard$;
