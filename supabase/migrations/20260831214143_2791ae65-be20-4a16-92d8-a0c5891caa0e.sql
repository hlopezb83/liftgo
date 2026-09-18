-- Las funciones de trigger no deben ser invocables desde la API.
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.rebound_quote_on_booking_cancel()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rebound_quote_on_booking_cancel() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.release_damage_on_invoice_cancel()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.release_damage_on_invoice_cancel() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.validate_transition()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.validate_transition() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.guard_quote_acceptance()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.guard_quote_acceptance() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
