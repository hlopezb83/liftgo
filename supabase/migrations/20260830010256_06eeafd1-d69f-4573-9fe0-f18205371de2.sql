-- Convención del repo: los helpers de guards no se exponen a la Data API.
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.quote_sale_units_unassigned(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.quote_sale_units_unassigned(uuid) FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.quote_sale_units_unassigned(uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.quote_sale_units_unassigned(uuid) TO service_role';
  END IF;
END $lgp_guard$;
