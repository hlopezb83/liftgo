DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.assign_prospect_stage_order()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.assign_prospect_stage_order() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
