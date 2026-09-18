DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.get_public_branding()') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_public_branding() TO anon, authenticated';
  END IF;
END $lgp_guard$;
