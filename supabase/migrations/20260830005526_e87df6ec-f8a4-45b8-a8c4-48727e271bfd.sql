DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.customer_has_active_bookings(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.customer_has_active_bookings(uuid) FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.customer_has_active_bookings(uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.customer_has_active_bookings(uuid) TO service_role';
  END IF;
END $lgp_guard$;
